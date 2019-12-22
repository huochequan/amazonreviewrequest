// Copyright © 2019 Sellerise //
$(function(){
	var timeout,
		amznRequestId = '',
		activeStore,
		pageOrders = [],
		work = false;


	// Jquery initialization
	///////////////////////////////////////////////////////////////////////////////
	$(document).ready(function(){

		chrome.storage.local.get('sl_email', function (result) {
			if(!(result.sl_email)){ return; }

			console.log('sellerise extension - up & running');

			messageCenter();
			injectModalBox();

			$(document).off('DOMSubtreeModified', '#orders-table');
			$(document).on('DOMSubtreeModified','#orders-table',function(){

				clearTimeout(timeout);
				timeout = setTimeout(function(){

					if($("#orders-table tbody tr").last().find('div[name=rw-bth]').length == 0){
						// console.log("sellerise: page update");
						injectGlobalRequestBth();
						injectMassRequestBth();
						processOrdersOnPage();
					}

			    }, 1000);

			});

		});
	});



	// Injection Func Initialization
	///////////////////////////////////////////////////////////////////////////////
	function injectModalBox(){

		$("body").prepend(`
			<div class="modal-box">
				<div class="status">
					<div class="compleate" name="status"></div>
				</div>
				<div class="info">
					<span name="title">Sending review request</span>
					<span class="sub-title" name="sub-title">0 successful, 0 failed</span>
				</div>
				<div class="controll" name="controll-box">
					<span name="controll-bth">Stop</span>
				</div>
			</div>
		`);

		$(document).off('click', 'div[name=controll-box]');
		$(document).on('click','div[name=controll-box]',function(){
			if($(".modal-box span[name=controll-bth]").html().toLowerCase() == 'close'){
				$(".modal-box").fadeOut();
			}

			if($(".modal-box span[name=controll-bth]").html().toLowerCase() == 'stop'){

				$(".modal-box div[name=status]").attr("class", "compleate");
				$(".modal-box span[name=controll-bth]").html("Close");

				$("span[name=global-review-manager]").attr("disabled", false).closest('.a-button').removeClass("disabled");
				$('span[name=mass-reviews]').removeClass("disabled").attr("disabled", false);

				chrome.runtime.sendMessage({
			        action: "orders-review",
			        type: "kill-all"
			    }, function(responce){});
			}
		});
	}

	function injectGlobalRequestBth() {

		var tabsContainer = $('#myo-spa-tabs-container').html();

		var fulfillType = 'fba';
		if(/data-test-id="tab-\/(.*?)\//.test(tabsContainer)){
			fulfillType = tabsContainer.match(/data-test-id="tab-\/(.*?)\//)[1];
		}

		if($('div[name=global-review-manager]').length != 0 && $('div[name=global-review-manager]').attr('type') == fulfillType) {
			return;
		}

		var dateRange = {
			start: moment().subtract(30, 'days').unix()+ '000',
			end:  moment().subtract(5, 'days').unix() + '000'
		}
		// var dateRange = {
		// 	start: '1494133200000',
		// 	end:'1572757198000'
		// }

		$('div[name=global-review-manager]').remove();
		getOrdersInfoByRange(dateRange, fulfillType).then(function (orders){

			var fulfillmentString = (fulfillType == 'fba') ? "FBA": "FBM";
			var status = (orders.total > 0) ? '' : 'disabled';

			$("form#myo-search").append(`
				<div name="global-review-manager" type="`+fulfillType+`">
				  <div class="a-row" name="global-rw-bth">
				    <span class="a-button a-button-normal myo-action-button `+status+`">
				      <span class="a-button-inner">
				        <span class="a-button-text" `+status+` role="button" name="global-review-manager" type="`+fulfillType+`">Global Review Request: `+ fulfillmentString +`</span>
				      </span>
				    </span>
				  </div>
				</div>
			`);


			$(document).off('click', 'span[name=global-review-manager]');
			$(document).on('click','span[name=global-review-manager]',function(){

				if(orders.total == 0){
					modalView(
		    			true,
		    			'No '+fulfillmentString+' orders to process.',
		    			'You are up to date!'
		    		);
		    		modalView(false);
					return;
				}

				$(this).attr("disabled", true);
				$(this).closest('.a-button').addClass("disabled");

				chrome.runtime.sendMessage({
			        action: "orders-review",
			        type: "global-process",
			        param: {
			        	orders: orders,
			        	host: location.hostname,
			        	amznRequestId: amznRequestId,
								fulfill: fulfillType,
			        }
			    }, function(responce){
			    	// console.log(responce);
			    });

			});
		}).catch(function(error) {
	       // console.log('error on orders data!')
	    });
	}

	function injectMassRequestBth(){

		if($('span[name=mass-reviews').length != 0){ return; }

		$('input[type="submit"][value="Refresh"]').closest('.push-right').parent().prepend(`
			<div class="push-right">
				<span name="mass-reviews" class="a-button">
					<span class="a-button-inner">
						<span class="a-button-text" aria-hidden="true">Mass Review Request (on Page)</span>
					</span>
				</span
			</div>
		`);

		$(document).off('click', 'span[name=mass-reviews]');
		$(document).on('click','span[name=mass-reviews]',function(){
			var self = this;
			processOrdersOnPage().then(function(orders){
				localStore().then(function(storageList){

					var uniqOrdersList = orders.filter(function(obj) { return storageList.indexOf(obj) == -1; });

					$(self).addClass("disabled").attr("disabled", true);
					if(uniqOrdersList.length == 0){
						modalView(
			    			true,
			    			'Orders on this page already processed.',
			    			'You are up to date!'
			    		);
			    		modalView(false);
						return;
					}

					$("div[name=rw-bth]").each(function(index, element) {
						$(this).find('.a-button').addClass("disabled");
						$(this).find('span[role=button]').attr("disabled", true);
						$(this).find('span[role=button]').html("Request Review Applied");
					});

					chrome.runtime.sendMessage({
				        action: "orders-review",
				        type: "on-page-process",
				        param: {
				        	orders: uniqOrdersList,
				        	host: location.hostname,
				        	amznRequestId: amznRequestId
				        }
				    }, function(responce){
				    	// console.log(responce);
				    });

				});
			})
		});
	}



	// Action Func Initialization
	///////////////////////////////////////////////////////////////////////////////
	function processOrdersOnPage() {
		return new Promise(function(resolve, reject) {
			var listOrders = [];
			localStore().then(function(storageList){

				var executeOnPageSpace = function(code) {
					var script = document.createElement('script')
					script.id = 'tmpScript'
					script.textContent = 'document.getElementById("tmpScript").textContent = JSON.stringify(' + code + ')'
					document.documentElement.appendChild(script)
					let result = document.getElementById("tmpScript").textContent
					script.remove()
					return JSON.parse(result)
				}
				let windowSetting = executeOnPageSpace('window.P.appConfig');
				let amazonDateFormat = moment().locale(windowSetting.marketplaceLocale)._locale._longDateFormat.L;

				$("#orders-table tbody tr").each(function(index, element) {

					var itemOrderId = $(element).find(".cell-body-title a").html();
					if(typeof itemOrderId === 'undefined') { return; }
					var itemOrderPandingStatus = $(element).find(".pandingStatus-status").length;
					var itemOrderRefunded = $(element).find(".refund-is-applied").length;
					if ($(element).find("div:contains('Non-Amazon')").length > 0) { itemOrderId = "NA"; }
					var itemOrderDate = $(element).find("td:nth(1) .cell-body div div:nth(1)").text();
					var itemOrderDateTime = $(element).find("td:nth(1) .cell-body div div:nth(2)").text();
					var itemOrderDateTimeZone = (itemOrderDateTime.length > 0) ? itemOrderDateTime.split(' ')[itemOrderDateTime.split(' ').length-1] : '';

					var itemOrderRange = {
						start: moment().subtract(30, 'days'),
						end: moment().subtract(5, 'days')
					};

					var itemOrderDateValid = moment(itemOrderDate, amazonDateFormat).isBetween(itemOrderRange.start, itemOrderRange.end);

					var bthText = 'Request Review';
					var bthEnabled = true;

					if (!itemOrderDateValid) {
						bthText = 'Request Review Pending';
						bthEnabled = false;
					}

					if (itemOrderRefunded > 0) {
						bthText = 'Ignore (Refunded Order)';
						bthEnabled = false;
					}

					if (itemOrderPandingStatus > 0) {
						bthText = 'Ignore (Pending Order)';
						bthEnabled = false;
					}

					if (storageList.indexOf(itemOrderId) != -1) {
						bthText = 'Request Review Applied';
						bthEnabled = false;
					}

					if(bthEnabled && itemOrderId !=  'NA'){
						listOrders.push(itemOrderId);
					}

					bthEnabled = (bthEnabled) ? '' : 'disabled';
					if($(element).find('span[review-order='+itemOrderId+']').length == 0){

						$($(element).last().find("td:last-child div:last-child")[0]).prepend(`
							<div>
							    <div class="a-row" name="rw-bth" review-order="`+itemOrderId+`">
								    <span class="a-button a-button-normal a-button-small myo-action-button `+bthEnabled+`" name="review-bth">
								    	<span class="a-button-inner">
								    		<span class="a-button-text" `+bthEnabled+` role="button" review-order="`+itemOrderId+`">`+bthText+`</span>
								    	</span>
								    </span>
							    </div>
							</div>
						`);
					}

					$(document).off('click', 'span[review-order='+itemOrderId+']');
		            $(document).on('click','span[review-order='+itemOrderId+']',function(){

		          		$(this).attr("disabled", true).html('Request Review Applied');
						$(this).closest('.a-button').addClass("disabled");

		                chrome.runtime.sendMessage({
					        action: "orders-review",
					        type: "on-page-process",
					        param: {
					        	orders: [itemOrderId],
					        	host: location.hostname,
					        	amznRequestId: amznRequestId
					        }
					    }, function(responce){
					    	// console.log(responce);
					    });
		            });
		        });

				if(listOrders.length == 0){
					$('span[name=mass-reviews]').addClass("disabled").attr("disabled", true);
				}else{
					$('span[name=mass-reviews]').removeClass("disabled").attr("disabled", false);
				}
				return resolve(listOrders);
			});
		});
	}

	function getOrdersInfoByRange(dateRange, fulfillType) {
		return new Promise(function(resolve, reject) {
			var xhr = new XMLHttpRequest();
		    xhr.addEventListener("load", function() {
		        if (xhr.readyState === 4) {
			        if (xhr.status === 200) {
			       		amznRequestId = xhr.getResponseHeader("x-amzn-requestid");
			         	var response = JSON.parse(xhr.responseText);
			         	return resolve({
			         		total: response.total,
			         		range: dateRange
			         	});
			        }
			    }
			    reject();
		    }, false);
		    xhr.open('GET', 'https://'+location.hostname+'/orders-api/search?limit=1&offset=0&sort=order_date_asc&date-range='+dateRange.start+'-'+dateRange.end+'&fulfillmentType='+fulfillType+'&orderStatus=shipped&forceOrdersTableRefreshTrigger=false');
		    xhr.send();
		});
	}



	// Info Func Initialization
	///////////////////////////////////////////////////////////////////////////////
	function messageCenter(){

		chrome.runtime.onMessage.addListener(function(request, sender, callback) {

		    if(request.action == "orders-review"){

		    	if(request.type == 'scan-order-pages'){
		    		var dateRange = {
						start: moment().subtract(30, 'days').format('MMM D'),
						end: moment().subtract(5, 'days').format('MMM D')
					}
		    		modalView(
		    			true,
		    			'Scaning ' + request.progress.total + ' order pages ( '+dateRange.start+' - '+dateRange.end+' )',
		    			request.progress.success + " successful, " + request.progress.failed + " failed"
		    		);
		    		$("span[name=global-review-manager]").attr("disabled", true).closest('.a-button').addClass("disabled");
		    	}

		    	if(request.type == 'send-review-request'){
		    		modalView(
		    			true,
		    			'Sending ' + request.progress.total + ' review requests',
		    			request.progress.success + " successful, " + request.progress.failed + " failed"
		    		);
		    		$("span[name=global-review-manager]").attr("disabled", true).closest('.a-button').addClass("disabled");
		    	}

		    	if(request.type == 'up-to-date'){
		    		modalView(
		    			true,
		    			'No new orders to process.',
		    			'You are up to date!'
		    		);
		    	}

		    	if(request.type == 'task-compleate'){
		    		modalView(false);
		    	}

		    }
		    callback(true);
		});
	}

	function modalView(show = true, title = 'Sending review requests', subtitle = '0 successful, 0 failed') {

		if(!show){
			$(".modal-box div[name=status]").attr("class", "compleate");
			$(".modal-box span[name=controll-bth]").html("Close");

			// $('span[name=mass-reviews]').removeClass("disabled").attr("disabled", false);
			$("span[name=global-review-manager]").attr("disabled", false).closest('.a-button').removeClass("disabled");
			return;
		}

		if (!$('.modal-box').is(':visible')) { $(".modal-box").fadeIn(); }
		$(".modal-box div[name=status]").attr("class", "loader");
		$(".modal-box span[name=controll-bth]").html("Stop");
		$(".modal-box span[name=title]").html(title);
		$(".modal-box span[name=sub-title]").html(subtitle);
	}



	// Local Storage Initialization
	///////////////////////////////////////////////////////////////////////////////
	function localStore(orderId = '') {
		return new Promise(function(resolve, reject) {
			chrome.storage.local.get('reviewOrders', function (result) {
				var orderList = (result.reviewOrders) ? result.reviewOrders : [];

				if(orderId != '' && orderList.indexOf(orderId) == -1){
					orderList.push(orderId);

					chrome.storage.local.set({
						'reviewOrders': orderList
					}, function () {
						// console.log("updated")
					});
				}
				return resolve(orderList);
			});
		});
	}
});

// Copyright © 2019 Sellerise //
var senderTab,
	work = false,
	amznRequestId = '',
	hostMarketPlaceID = {
		'sellercentral.amazon.com' : 'ATVPDKIKX0DER',
		'sellercentral.amazon.com.au' : 'A39IBJ37TRP1C6',
		'sellercentral.amazon.co.uk': 'A1F83G8C2ARO7P',
		'sellercentral.amazon.ca': 'A2EUQ1WTGCTBG2',
		'sellercentral.amazon.de': 'A1PA6795UKMFR9',
		'sellercentral.amazon.co.jp': 'A1VC38T7YXB528',
		'sellercentral.amazon.fr': 'A13V1IB3VIYZZH',
		'sellercentral.amazon.es': 'A1RKKUPIHCS9HS',
		'sellercentral.amazon.it': 'APJ6JRA9NG5V4'
	};




chrome.runtime.onMessage.addListener(function(request, sender, callback) {

    if(request.action == "orders-review"){

    	senderTab = sender.tab;

    	if(request.type == 'global-process'){
			globalWorker(request.param);
			return callback(true);
		}

    	if(request.type == 'on-page-process'){
			onPageWorker(request.param);
			return callback(true);
		}

		if(request.type == 'kill-all'){
			// console.log('kill-all');
			work = false;
			return callback(true);
		}

    }
});

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



// Request Func Initialization
///////////////////////////////////////////////////////////////////////////////
function request(type, reqURL) {
    return new Promise(function(resolve, reject) {
    	if(!work){ return resolve({}); }
    	try{

    		$.ajax({
			    url : reqURL,
			    type: type,
			    data : "{}",
			    timeout: 60000,
			    dataType: "json",
					contentType: "application/json",
			    beforeSend: function (req) {
					req.setRequestHeader("x-requested-with", amznRequestId);
					req.setRequestHeader("anti-csrftoken-a2z", amznRequestId);
				},
				xhr: function () {
					var xhr = jQuery.ajaxSettings.xhr();
					var setRequestHeader = xhr.setRequestHeader;
					xhr.setRequestHeader = function (name, value) {
						if (name == 'X-Requested-With') return;
						setRequestHeader.call(this, name, value);
					}
					return xhr;
				},
			    success: function(data, textStatus, jqXHR)
			    {

			    	if( jqXHR.getResponseHeader("x-amzn-requestid") ){
			    		amznRequestId = jqXHR.getResponseHeader("x-amzn-requestid");
			    	}
			    	// console.log(amznRequestId);
		         	if(data){
		         		return resolve(data);
		         	}
		         	resolve({});
			    },
			    error: function (jqXHR, textStatus, errorThrown)
			    {
			    	// console.log(errorThrown);
			 		resolve({});
			    }
			});

		}catch(e){
			resolve({});
		}
    });
}

function requestProgressEvent(type, total = 0, status) {
	// console.log(type + "    [total: " + total + " / success: " + status.success + " / failed: " + status.failed +']');
	chrome.tabs.query({active: true, currentWindow: true}, function(tabs){
		var activeTab = (tabs[0]) ? tabs[0] : senderTab;
		if(activeTab.id && work){
		    chrome.tabs.sendMessage(activeTab.id, {
		    	action: "orders-review",
		        type: type,
		        progress:{
		        	total: total,
		        	success: (status)?status.success:0,
		        	failed: (status)?status.failed:0
		        }
		    }, function(response) { });
		}
	});
}

function requestFinishEvent(type, total = 0, status) {
	// console.log(type + "    [total: " + total + " / success: " + status.success + " / failed: " + status.failed +'] --- FINISHED');
	chrome.tabs.query({active: true, currentWindow: true}, function(tabs){
		var activeTab = (tabs[0]) ? tabs[0] : senderTab;
		if(activeTab.id){
		    chrome.tabs.sendMessage(activeTab.id, {
		    	action: "orders-review",
		        type: "task-compleate",
		    }, function(response) { });
		}
	});
}



// Global Manager Func Initialization
///////////////////////////////////////////////////////////////////////////////
function globalWorker(param) {

	const funcName = '[Sellerise: globalWorker]';

	work = true;
	amznRequestId = param.amznRequestId;

	scanOrderPages(param)
	.then(function(orders){

		if(orders.length == 0){
			requestProgressEvent('up-to-date');
			requestFinishEvent('scan-order-pages');
			return true;
		}
		if(!work){ return false; }
		return requestOrdersReview(param.host, orders);
	})
	.then(function(result){
		// console.log('work done')
	})
	.catch(function(err) {
   		// console.log(funcName, err);
    });
}

function scanOrderPages(param) {

	const funcName = '[Sellerise: scanOrderPages]';
	const workType = 'scan-order-pages';

	return new Promise(function(resolve, reject) {

		if(param.orders.total == 0){
			return;
		}

		var data = [],
			ordersPerPage = 500;
		var pages = Math.ceil(param.orders.total/ordersPerPage);
			pages = (pages>20)?20:pages;

		for (var i = 0; i <= pages-1; i++) {
			var offset = i * ordersPerPage;
			data.push('https://'+param.host+'/orders-api/search?limit='+ ordersPerPage +'&offset='+offset+'&sort=order_date_asc&date-range='+param.orders.range.start+'-'+param.orders.range.end+'&fulfillmentType='+param.fulfill+'&orderStatus=shipped&forceOrdersTableRefreshTrigger=false');
		}

		const delay = ms => new Promise(resolve => {
			if(!work){ ms = 0; }
			setTimeout(resolve, ms)
		});

		var status = { success: 0, failed: 0 };
		data.reduce(function(promise, pageURL, index) {
			return promise.then(function(result) {

				if(!work){ throw new Error('kill-all was initiate'); }
				if(index == 0){ requestProgressEvent(workType, data.length, status); }

				return request('GET', pageURL).then(function(response){

					if (response.orders) { status.success++; }else{ status.failed++; }
					requestProgressEvent(workType, data.length, status);

					var ordersId = [];
					if(response.orders && response.orders.length > 0){
						ordersId = response.orders.map(function(order){
							return order.amazonOrderId;
						});
					}

					if(index == data.length-1){
						return [ ...result, ordersId ];
					}
					return delay(2000).then(function(){
						return [ ...result, ordersId ];
					})

				});
		  	})
		}, Promise.resolve([])).then(function(result) {

			var ordersId = [].concat.apply([], result);
			return localStore().then(function(storageList){

				var uniqOrdersList = ordersId.filter(function(obj) { return storageList.indexOf(obj) == -1; });

				requestFinishEvent(workType, data.length, status);
				resolve(uniqOrdersList);
			});
	    })
	   	.catch(function(err) {
	   		// console.log(funcName, err);
	   		requestFinishEvent(workType, data.length, status);
        	reject(err);
	    });
	});
}

function requestOrdersReview(host, orders) {

	const funcName = '[Sellerise: requestOrdersReview]';
	const workType = 'send-review-request';

	return new Promise(function(resolve, reject) {

		var data = [];
		orders.forEach(function(orderId){
			data.push({
				id: orderId,
				url: 'https://'+ host +'/messaging/api/solicitations/'+ orderId +'/productReviewAndSellerFeedback?marketplaceId='+ hostMarketPlaceID[host] +'&buyerId=&customerType=&isReturn=false&documentReferrer=https%3A%2F%2F'+ host +'%2Forders-v3%2Forder%2F' + orderId,
				// url: 'https://'+ host +'/messaging/api/solicitations/'+ orderId +'/productReviewAndSellerFeedback?marketplaceId='+ hostMarketPlaceID[host] +'&buyerId=&customerType=&isReturn=false&documentReferrer='
			});
		});

		const delay = ms => new Promise(resolve => {
			if(!work){ ms = 0; }
			setTimeout(resolve, ms)
		});

		var status = { success: 0, failed: 0 };
		data.reduce(function(promise, order, index) {
			return promise.then(function(result) {
				if(!work){ throw new Error('kill-all was enable'); }
				if(index == 0){ requestProgressEvent(workType, data.length, status); }
				return request('POST', order.url).then(function(response){

					if (response.isSuccess) {
						status.success++;
						localStore(order.id);
					}else{ status.failed++; }

					requestProgressEvent(workType, data.length, status);

					if(index == data.length-1){
						return [ ...result, response ];
					}
					return delay(1000).then(function(){
						return [ ...result, response ];
					})
				});
		  	})
		}, Promise.resolve([])).then(function(result) {
			requestFinishEvent(workType, data.length, status);
			resolve(result);
	    })
	   	.catch(function(err) {
	   		// console.log(funcName, err);
	   		requestFinishEvent(workType, data.length, status);
        	reject(err);
	    });
	});
}


// On Page Manager Func Initialization
///////////////////////////////////////////////////////////////////////////////
function onPageWorker(param){

	const funcName = '[Sellerise: onPageWorker]';

	work = true;
	amznRequestId = param.amznRequestId;

	if(param.orders.length == 0 || work == false){ return false; }
	requestOrdersReview(param.host, param.orders)
	.then(function(result){
		// console.log(result)
	})
	.catch(function(err) {
   		// console.log(funcName, err);
    });
}

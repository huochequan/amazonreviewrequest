$(function(){
	
	$(document).ready(function(){
		chrome.storage.local.get('sl_email', function (result) {
			$("p[name=sub-title]").html('User: ' + result.sl_email);
		});
		
		$(document).off('click', 'button[type=submit]');
		$(document).on('click','button[type=submit]',function(){
			chrome.storage.local.set({'sl_email':  null })
			window.location.href = "../auth/login.html";
		});

		$("body").on("click", ".close-bth", function(e){
			e.preventDefault();
			window.close();
		});

	});
       
});


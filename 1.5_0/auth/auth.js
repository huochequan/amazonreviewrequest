$(function(){

	$(document).ready(function(){
		$('.container').hide();
		chrome.storage.local.get('sl_email', function (result) {
			var isAuth = (result.sl_email);

			if(isAuth){
				window.location.href = "../user/main.html";
				return
			}
			$('.container').show();
		});

		$('form[name=auth]').on('submit', function(e) { 
	        e.preventDefault();

	        var formData = {};
	        $('form[name=auth]').serializeArray().map(function(x){ formData[x.name] = x.value; });

	        $.post( "https://sellerise.com/php/notify-chrome.php", { email: formData['email'], referral: "" })
			.done(function( data ) {
				chrome.storage.local.set({'sl_email': formData['email'] })
	        	window.location.href = "../user/main.html";
			});
	    });

	    $("body").on("click", ".close-bth", function(e){
			e.preventDefault();
			window.close();
		});
	});
  
});


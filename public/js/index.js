/**
 * Created by rouven on 25.02.17.
 */

require(["common"], function(common) {
    require([
        "jquery",
        "lib/domReady"],
        function ($, domReady) {
            $(".slide-link").click(function(e) {
                if (
                    e.ctrlKey ||
                    e.shiftKey ||
                    e.metaKey || // apple
                    (e.button && e.button == 1) // middle click, >IE9 + everyone else
                ){
                    return;
                }
                e.preventDefault();

                var target = $(this).attr('href');

                var navigated = false;
                function navigate() {
                    if (!navigated) {
                        navigated = true;
                        window.location = target;
                    }
                }

                $('body').one("transitionend webkitTransitionEnd oTransitionEnd MSTransitionEnd", navigate).addClass('slide-left');
                setTimeout(navigate, 300);

                return false;
            });
            if (location.search.includes('analog') || location.href.match(/[\?&]analog\b/)){
                $('[href="gamepad.html"]').attr('href', 'gamepad.html?analog');
            }
        });
});

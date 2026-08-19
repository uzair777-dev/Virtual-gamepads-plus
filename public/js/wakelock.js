// Screen Wake Lock API to keep phone screen awake during gameplay
var wakeLock = null;

async function requestWakeLock() {
  try {
    if ('wakeLock' in navigator) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', function() {
        wakeLock = null;
        console.log('[WakeLock] Screen Wake Lock released');
      });
      console.log('[WakeLock] Screen Wake Lock active');
    }
  } catch (err) {
    console.log('[WakeLock] Notice: Wake Lock deferred until user touch interaction (' + err.message + ')');
  }
}

// Request immediately and on first user gesture
requestWakeLock();
['touchstart', 'pointerdown', 'click'].forEach(function(evt) {
  document.addEventListener(evt, function() {
    if (!wakeLock) {
      requestWakeLock();
    }
  }, { passive: true, once: true });
});

// Re-acquire wake lock when switching back to this tab/app
document.addEventListener('visibilitychange', function() {
  if (document.visibilityState === 'visible' && !wakeLock) {
    requestWakeLock();
  }
});

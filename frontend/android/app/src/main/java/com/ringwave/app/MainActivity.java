package com.ringwave.app;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.BridgeActivity;

/**
 * Two things beyond Capacitor's default BridgeActivity, both required for
 * WebRTC calls to actually work — without either one, the microphone
 * simply never becomes available to the web page's getUserMedia() call,
 * even though the user never sees an error explaining why:
 *
 *   1. Request the RECORD_AUDIO runtime permission (Android 6+) as soon as
 *      the activity starts, rather than waiting for the web page to ask
 *      and then having nothing to show the user. See
 *      android.permission.RECORD_AUDIO in AndroidManifest.xml — declaring
 *      it there is necessary but not sufficient; "dangerous" permissions
 *      also need this runtime request.
 *
 *   2. Override the WebView's onPermissionRequest so that when the page
 *      calls getUserMedia() for audio, the WebView actually grants
 *      RESOURCE_AUDIO_CAPTURE. Capacitor's default WebViewClient does not
 *      do this automatically — without this override, getUserMedia()
 *      rejects even if the Android-level RECORD_AUDIO permission above was
 *      already granted by the user.
 */
public class MainActivity extends BridgeActivity {

  private static final int RECORD_AUDIO_REQUEST_CODE = 1001;

  @Override
  public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);

    if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO)
        != PackageManager.PERMISSION_GRANTED) {
      ActivityCompat.requestPermissions(
          this,
          new String[] { Manifest.permission.RECORD_AUDIO },
          RECORD_AUDIO_REQUEST_CODE
      );
    }

    this.bridge.getWebView().setWebChromeClient(new WebChromeClient() {
      @Override
      public void onPermissionRequest(final PermissionRequest request) {
        runOnUiThread(() -> {
          for (String resource : request.getResources()) {
            if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource)) {
              request.grant(new String[] { PermissionRequest.RESOURCE_AUDIO_CAPTURE });
              return;
            }
          }
          // Anything else requested (e.g. RESOURCE_VIDEO_CAPTURE) is
          // deliberately not granted — RingWave is a voice-only calling
          // app, and silently granting camera access it doesn't use
          // would be a real, unnecessary privacy overreach.
          request.deny();
        });
      }
    });
  }
}

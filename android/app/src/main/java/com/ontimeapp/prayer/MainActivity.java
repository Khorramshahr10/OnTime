package com.ontimeapp.prayer;

import android.os.Bundle;
import androidx.activity.EdgeToEdge;
import androidx.appcompat.app.ActionBar;
import androidx.core.splashscreen.SplashScreen;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        SplashScreen.installSplashScreen(this);
        EdgeToEdge.enable(this);
        registerPlugin(AthanPlugin.class);
        super.onCreate(savedInstanceState);

        ActionBar actionBar = getSupportActionBar();
        if (actionBar != null) {
            actionBar.hide();
        }
    }
}

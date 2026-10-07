plugins {
    id("com.android.application") version "8.5.2"
    id("org.jetbrains.kotlin.android") version "1.9.24"
}

android {
    namespace = "com.developerconnects.dialer"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.developerconnects.dialer"
        minSdk = 26
        targetSdk = 34
        versionCode = 1
        versionName = "0.1-unverified"
        // The ONLY site the WebView may show (and the only one that ever sees window.DCDialer).
        buildConfigField("String", "START_URL", "\"https://developerconnects.com/team\"")
        // Clerk's sign-in host for the production instance; set when the production Clerk instance exists.
        buildConfigField("String", "EXTRA_ALLOWED_HOSTS", "\"\"")
    }
    buildFeatures { buildConfig = true }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}

dependencies {
    implementation("androidx.activity:activity-ktx:1.9.1")
    implementation("androidx.core:core-ktx:1.13.1")
}

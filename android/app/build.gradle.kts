import java.util.Properties

plugins {
  id("com.android.application")
}

// Push stays off (empty FCM token) until the Firebase config lands in app/google-services.json.
if (file("google-services.json").exists()) {
  apply(plugin = "com.google.gms.google-services")
}

// Upload key lives outside git: android/keystore.properties (storeFile, storePassword, keyAlias, keyPassword).
val keystoreProps = Properties().apply {
  val f = rootProject.file("keystore.properties")
  if (f.exists()) f.inputStream().use { load(it) }
}

android {
  namespace = "com.edgetilt.app"
  compileSdk = 36

  defaultConfig {
    applicationId = "com.edgetilt.app"
    minSdk = 28
    targetSdk = 36
    versionCode = 5
    versionName = "1.3.1"
  }

  buildFeatures {
    buildConfig = true
    resValues = true
  }

  flavorDimensions += "env"
  productFlavors {
    create("prod") {
      dimension = "env"
      buildConfigField("String", "BASE_URL", "\"https://edgetilt.com\"")
      resValue("string", "app_name", "Edge")
    }
    create("staging") {
      dimension = "env"
      applicationIdSuffix = ".test"
      buildConfigField("String", "BASE_URL", "\"https://lvslotpro.com\"")
      resValue("string", "app_name", "Edge Test")
    }
  }

  signingConfigs {
    if (keystoreProps.getProperty("storeFile") != null) {
      create("upload") {
        storeFile = rootProject.file(keystoreProps.getProperty("storeFile"))
        storePassword = keystoreProps.getProperty("storePassword")
        keyAlias = keystoreProps.getProperty("keyAlias")
        keyPassword = keystoreProps.getProperty("keyPassword")
      }
    }
  }

  buildTypes {
    getByName("release") {
      isMinifyEnabled = false
      signingConfig = signingConfigs.findByName("upload")
    }
  }

  compileOptions {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
  }
}

dependencies {
  implementation(platform("com.google.firebase:firebase-bom:34.19.0"))
  implementation("com.google.firebase:firebase-messaging")
  implementation("androidx.webkit:webkit:1.17.1")
  implementation("androidx.core:core:1.9.0")
  implementation("androidx.media3:media3-transformer:1.11.1")
  implementation("androidx.media3:media3-effect:1.11.1")
  implementation("androidx.media3:media3-common:1.11.1")
}

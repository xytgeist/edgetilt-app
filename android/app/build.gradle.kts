import java.util.Properties

plugins {
  id("com.android.application")
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
    versionCode = 1
    versionName = "1.0.0"
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

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.plugin.compose")
    id("org.jetbrains.kotlin.plugin.serialization")
    id("com.google.devtools.ksp")
}

android {
    namespace = "com.pinvoice.app"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.pinvoice.app"
        minSdk = 26
        targetSdk = 35
        versionCode = 8
        versionName = "2.2.0"
    }

    buildFeatures {
        compose = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    implementation(project(":shared"))
    implementation(platform("androidx.compose:compose-bom:2025.02.00"))
    implementation("androidx.activity:activity-compose:1.10.0")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.7")

    // Room DB (Fila Offline + Evoluções locais)
    implementation("androidx.room:room-runtime:2.8.5")
    implementation("androidx.room:room-ktx:2.8.5")
    ksp("androidx.room:room-compiler:2.8.5")

    // WorkManager (Envio automático no retorno de 4G/Wi-Fi)
    implementation("androidx.work:work-runtime-ktx:2.10.0")

    // Wearable Data Layer (Receber áudio do relógio + comandar purge)
    implementation("com.google.android.gms:play-services-wearable:19.0.0")

    // HTTP Client leve para chamada direta BYOK ao Gemini e sync Supabase
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.10.1")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-play-services:1.10.1")
}

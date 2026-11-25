plugins {
    id("com.android.application") version "9.5.2" apply false
    id("org.jetbrains.kotlin.jvm") version "2.4.21" apply false
    id("org.jetbrains.kotlin.plugin.compose") version "2.4.21" apply false
    id("org.jetbrains.kotlin.plugin.serialization") version "2.4.21" apply false
    id("com.google.devtools.ksp") version "2.3.14" apply false
}

// Mantém os artefatos temporários de build fora do OneDrive (evita travamento de arquivos no Windows)
subprojects {
    val localBuildRoot = File(
        System.getenv("LOCALAPPDATA") ?: System.getProperty("java.io.tmpdir"),
        "PinVoiceAndroidBuild/${project.name}",
    )
    layout.buildDirectory.set(localBuildRoot)
}

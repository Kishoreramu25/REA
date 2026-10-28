# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /usr/local/Cellar/android-sdk/24.3.3/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# react-native-reanimated
-keep class com.swmansion.reanimated.** { *; }
-keep class com.facebook.react.turbomodule.** { *; }

# Expo Modules Core, reflection, and task consumers
-keep class expo.modules.** { *; }
-keep interface expo.modules.** { *; }
-keepclassmembers class expo.modules.** { *; }
-dontwarn expo.modules.**

# Expo Task Manager and Location Task Consumers
-keep class * extends expo.modules.interfaces.taskManager.TaskConsumer { *; }
-keepclassmembers class * extends expo.modules.interfaces.taskManager.TaskConsumer {
    public <init>(android.content.Context, expo.modules.interfaces.taskManager.TaskManagerUtilsInterface);
    <init>(...);
}
-keep class expo.modules.location.taskConsumers.** { *; }
-keepclassmembers class expo.modules.location.taskConsumers.** {
    public <init>(...);
    *;
}
-keep class expo.modules.taskManager.** { *; }
-keepclassmembers class expo.modules.taskManager.** {
    *;
}

# Keep Google Play services location
-keep class com.google.android.gms.location.** { *; }
-dontwarn com.google.android.gms.location.**


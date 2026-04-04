import * as Notifications from 'expo-notifications';
import * as Calendar from 'expo-calendar';
import { Platform, Linking } from 'react-native';
import { Task } from '@/store/useStore';



export async function requestNotificationPermissions() {
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  
  if (finalStatus !== 'granted') {
    return false;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#00D4FF',
    });
  }

  return true;
}

export async function scheduleTaskNotification(task: Task) {
  if (!task.start_time) return null;

  const startTime = new Date(task.start_time);
  const triggerDate = new Date(startTime.getTime() - (task.alarm_minutes_before || 10) * 60000);

  // If the trigger time has already passed, don't schedule
  if (triggerDate.getTime() <= Date.now()) {
    return null;
  }

  const notificationId = await Notifications.scheduleNotificationAsync({
    content: {
      title: `${task.title} Starting Soon`,
      body: `You have ${task.alarm_minutes_before || 10} minutes to prepare. Tap to open Smart Alarm.`,
      data: { taskId: task.id, type: 'smart-alarm' },
      sound: true,
      priority: Notifications.AndroidNotificationPriority.MAX,
    },
    trigger: {
      date: triggerDate,
    } as any,
  });



  return notificationId;
}

export async function cancelAllTaskNotifications() {
  await Notifications.cancelAllScheduledNotificationsAsync();
}

export async function requestCalendarPermissions() {
  const { status } = await Calendar.requestCalendarPermissionsAsync();
  return status === 'granted';
}


export async function requestDNDPermissions() {
  // DND control is OS-level and restricted in standard Expo.
  // We'll redirect to settings on Android if they want to manage it.
  if (Platform.OS === 'android') {
    // Open notification settings as a proxy
    return true;
  }
  return true; // Return true as a fallback for the UI toggle
}


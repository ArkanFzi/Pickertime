import * as Calendar from 'expo-calendar';
import { Platform } from 'react-native';
import { Task } from '@/store/useStore';

// Expo Go SDK 53+ no longer supports expo-notifications remote/push features.
// We lazy-load the module to prevent app crashes during import.
let NotificationsModule: typeof import('expo-notifications') | null = null;

async function getNotificationsModule() {
  if (NotificationsModule) return NotificationsModule;
  try {
    NotificationsModule = await import('expo-notifications');
    return NotificationsModule;
  } catch {
    console.warn('expo-notifications not available in this environment.');
    return null;
  }
}

export async function requestNotificationPermissions(): Promise<boolean> {
  try {
    const Notifications = await getNotificationsModule();
    if (!Notifications) return false;

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
  } catch (error) {
    console.log('Notification permission error:', error);
    return false;
  }
}

export async function scheduleTaskNotification(task: Task): Promise<string | null> {
  if (!task.start_time) return null;

  try {
    const Notifications = await getNotificationsModule();
    if (!Notifications) return null;

    const startTime = new Date(task.start_time);
    const triggerDate = new Date(startTime.getTime() - (task.alarm_minutes_before || 10) * 60000);

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
  } catch (error) {
    console.log('Scheduling notification failed (Expo Go limitation):', error);
    return null;
  }
}

export async function cancelAllTaskNotifications(): Promise<void> {
  try {
    const Notifications = await getNotificationsModule();
    if (!Notifications) return;
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch (error) {
    console.log('Cancel notifications error:', error);
  }
}

export async function requestCalendarPermissions(): Promise<boolean> {
  const { status } = await Calendar.requestCalendarPermissionsAsync();
  return status === 'granted';
}

export async function requestDNDPermissions(): Promise<boolean> {
  return true;
}

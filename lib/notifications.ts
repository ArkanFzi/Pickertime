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
  if (!task.start_time || !task.has_alarm) return null;

  try {
    const Notifications = await getNotificationsModule();
    if (!Notifications) return null;

    // Tanpa izin, scheduleNotificationAsync tetap mengembalikan id tapi alarmnya tidak
    // pernah bunyi — jadi jangan mengaku terpasang.
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') return null;

    const startTime = new Date(task.start_time);
    const leadMinutes = task.alarm_minutes_before || 10;
    const triggerDate = new Date(startTime.getTime() - leadMinutes * 60000);

    if (triggerDate.getTime() <= Date.now()) {
      return null;
    }

    // Identifier = task.id, bukan id generasi baru, supaya alarm lama bisa dibatalkan
    // walau dijadwalkan pada sesi aplikasi sebelumnya.
    await cancelTaskNotification(task.id);

    return await Notifications.scheduleNotificationAsync({
      content: {
        title: `${task.title} Starting Soon`,
        body: `You have ${leadMinutes} minutes to prepare. Tap to open Smart Alarm.`,
        data: { taskId: task.id, type: 'smart-alarm' },
        sound: true,
        priority: Notifications.AndroidNotificationPriority.MAX,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: triggerDate,
        identifier: task.id,
      } as any,
    });
  } catch (error) {
    console.log('Scheduling notification failed (Expo Go limitation):', error);
    return null;
  }
}

export async function cancelTaskNotification(taskId: string): Promise<void> {
  try {
    const Notifications = await getNotificationsModule();
    if (!Notifications) return;
    await Notifications.cancelScheduledNotificationAsync(taskId);
  } catch {
    // Tidak pernah terjadwal — bukan kegagalan yang perlu dilaporkan ke user.
  }
}

// Sumber kebenaran chip "Smart Alarm set": apa yang benar-benar ada di OS, bukan
// apa yang dulu diminta user (F-22).
export async function listArmedAlarmTaskIds(): Promise<string[]> {
  try {
    const Notifications = await getNotificationsModule();
    if (!Notifications) return [];
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    return scheduled
      .map((n: any) => n?.request?.trigger?.identifier ?? n?.request?.content?.data?.taskId)
      .filter((id: any): id is string => typeof id === 'string' && id.length > 0);
  } catch (error) {
    console.log('Reading scheduled notifications failed:', error);
    return [];
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

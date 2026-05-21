import Dexie from 'dexie';

const db = new Dexie('OMRDatabase');

db.version(1).stores({
  photo_queue: '++id, sessionId, status, timestamp, retryCount',
});

export async function addToQueue(imageData, sessionId) {
  return db.photo_queue.add({
    sessionId,
    imageData,
    status: 'PENDING',
    timestamp: Date.now(),
    retryCount: 0,
    createdAt: new Date().toISOString(),
  });
}

export async function getPendingItems() {
  return db.photo_queue.where('status').equals('PENDING').toArray();
}

export async function getFailedItems() {
  return db.photo_queue.where('status').equals('FAILED').toArray();
}

export async function updateStatus(id, status, error = null) {
  const updates = { status };
  if (error) updates.error = error;
  if (status === 'UPLOADING') {
    updates.uploadedAt = new Date().toISOString();
  }
  return db.photo_queue.update(id, updates);
}

export async function incrementRetryCount(id) {
  const item = await db.photo_queue.get(id);
  if (item) {
    return db.photo_queue.update(id, { retryCount: item.retryCount + 1 });
  }
  return null;
}

export async function clearQueue() {
  return db.photo_queue.clear();
}

export async function getQueueStats() {
  const all = await db.photo_queue.toArray();
  return {
    total: all.length,
    pending: all.filter((i) => i.status === 'PENDING').length,
    uploading: all.filter((i) => i.status === 'UPLOADING').length,
    success: all.filter((i) => i.status === 'SUCCESS').length,
    failed: all.filter((i) => i.status === 'FAILED').length,
  };
}

export default db;

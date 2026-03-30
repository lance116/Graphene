const windows = new Map<string, number[]>();

export function checkRateLimit(userId: string, maxRequests = 10, windowMs = 60000): boolean {
  const now = Date.now();
  const timestamps = windows.get(userId) || [];

  // Remove expired timestamps
  const valid = timestamps.filter(t => now - t < windowMs);

  if (valid.length >= maxRequests) {
    windows.set(userId, valid);
    return false;
  }

  valid.push(now);
  windows.set(userId, valid);
  return true;
}

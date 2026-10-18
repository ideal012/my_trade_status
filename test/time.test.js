import { test } from 'node:test';
import assert from 'node:assert/strict';
import { localToUtc, toLocal, dayKey, hourOf, weekdayOf } from '../public/lib/time.js';

test('Bangkok is UTC+7', () => {
  assert.equal(localToUtc('2024-03-04T15:30', 'Asia/Bangkok'), '2024-03-04T08:30:00.000Z');
  assert.equal(toLocal('2024-03-04T08:30:00.000Z', 'Asia/Bangkok'), '2024-03-04T15:30');
});

test('DST zones convert on both sides of the change', () => {
  assert.equal(localToUtc('2024-01-15T09:00', 'America/New_York'), '2024-01-15T14:00:00.000Z');
  assert.equal(localToUtc('2024-07-15T09:00', 'America/New_York'), '2024-07-15T13:00:00.000Z');
});

test('local round trip', () => {
  for (const tz of ['Asia/Bangkok', 'Europe/London', 'UTC']) {
    assert.equal(toLocal(localToUtc('2024-06-01T23:45', tz), tz), '2024-06-01T23:45');
  }
});

test('day, hour and weekday follow the chosen timezone', () => {
  const iso = '2024-03-04T20:00:00.000Z'; // Mon 20:00 UTC = Tue 03:00 Bangkok
  assert.equal(dayKey(iso, 'Asia/Bangkok'), '2024-03-05');
  assert.equal(hourOf(iso, 'Asia/Bangkok'), 3);
  assert.equal(weekdayOf(iso, 'UTC'), 0); // Monday
  assert.equal(weekdayOf(iso, 'Asia/Bangkok'), 1); // Tuesday
});

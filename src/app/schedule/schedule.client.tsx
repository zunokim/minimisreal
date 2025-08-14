'use client';

import { useEffect, useState } from 'react';
import dayjs from 'dayjs';
import { calendar_v3 } from 'googleapis';
import 'dayjs/locale/ko';

dayjs.locale('ko');

interface CalendarForm {
  id?: string;
  title: string;
  description: string;
  location: string;
  start: string;
  end: string;
  allDay: boolean;
}

export default function ScheduleClient() {
  const [events, setEvents] = useState<calendar_v3.Schema$Event[]>([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<CalendarForm>({
    title: '',
    description: '',
    location: '',
    start: '',
    end: '',
    allDay: false,
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [popupOpen, setPopupOpen] = useState(false);

  const fetchEvents = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/calendar/events');
      if (!res.ok) throw new Error('이벤트 불러오기 실패');
      const data: { events: calendar_v3.Schema$Event[] } = await res.json();
      setEvents(data.events || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents();
  }, []);

  const openPopup = (event?: calendar_v3.Schema$Event) => {
    if (event) {
      setForm({
        id: event.id || '',
        title: event.summary || '',
        description: event.description || '',
        location: event.location || '',
        start:
          event.start?.dateTime || event.start?.date || dayjs().format('YYYY-MM-DD'),
        end:
          event.end?.dateTime || event.end?.date || dayjs().format('YYYY-MM-DD'),
        allDay: !!event.start?.date,
      });
      setEditingId(event.id || null);
    } else {
      setForm({
        title: '',
        description: '',
        location: '',
        start: dayjs().format('YYYY-MM-DD'),
        end: dayjs().format('YYYY-MM-DD'),
        allDay: false,
      });
      setEditingId(null);
    }
    setPopupOpen(true);
  };

  const closePopup = () => {
    setPopupOpen(false);
  };

  const handleFormChange = (field: keyof CalendarForm, value: string | boolean) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const saveEvent = async () => {
    const payload: CalendarForm = {
      title: form.title,
      description: form.description,
      location: form.location,
      start: form.start,
      end: form.end,
      allDay: form.allDay,
    };

    try {
      let url = '/api/calendar/events';
      let method: 'POST' | 'PATCH' = 'POST';
      if (editingId) {
        url = `/api/calendar/events/${editingId}`;
        method = 'PATCH';
      }

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('저장 실패');
      await fetchEvents();
      closePopup();
    } catch (e) {
      console.error(e);
    }
  };

  const deleteEvent = async (id: string) => {
    if (!confirm('삭제하시겠습니까?')) return;
    try {
      const res = await fetch(`/api/calendar/events/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('삭제 실패');
      await fetchEvents();
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="relative p-4">
      <div className="flex justify-between mb-4">
        <h1 className="text-lg font-bold">일정 관리</h1>
        <button
          className="bg-blue-500 text-white px-3 py-1 rounded hover:bg-blue-600"
          onClick={() => openPopup()}
        >
          새 일정
        </button>
      </div>

      {loading ? (
        <p>불러오는 중...</p>
      ) : (
        <ul className="space-y-2">
          {events.map((event) => {
            const isAllDay = !!event.start?.date;
            const bgColor = isAllDay
              ? 'bg-orange-100'
              : 'bg-orange-200';

            return (
              <li
                key={event.id}
                className={`p-2 rounded ${bgColor} flex justify-between items-center`}
              >
                <div>
                  <div className="font-semibold">{event.summary}</div>
                  {isAllDay ? null : (
                    <div className="text-sm text-gray-600">
                      {dayjs(event.start?.dateTime).format('MM/DD HH:mm')} ~{' '}
                      {dayjs(event.end?.dateTime).format('MM/DD HH:mm')}
                    </div>
                  )}
                </div>
                <div className="space-x-2">
                  <button
                    className="text-blue-500"
                    onClick={() => openPopup(event)}
                  >
                    수정
                  </button>
                  <button
                    className="text-red-500"
                    onClick={() => deleteEvent(event.id || '')}
                  >
                    삭제
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {popupOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black opacity-50"
            onClick={closePopup}
          ></div>
          <div className="relative bg-white rounded p-6 z-50 w-full max-w-md">
            <h2 className="text-lg font-bold mb-4">
              {editingId ? '일정 수정' : '일정 추가'}
            </h2>
            <input
              className="border p-2 w-full mb-2"
              placeholder="제목"
              value={form.title}
              onChange={(e) => handleFormChange('title', e.target.value)}
            />
            <textarea
              className="border p-2 w-full mb-2"
              placeholder="설명"
              value={form.description}
              onChange={(e) => handleFormChange('description', e.target.value)}
            />
            <input
              className="border p-2 w-full mb-2"
              placeholder="위치"
              value={form.location}
              onChange={(e) => handleFormChange('location', e.target.value)}
            />
            <label className="flex items-center mb-2">
              <input
                type="checkbox"
                checked={form.allDay}
                onChange={(e) => handleFormChange('allDay', e.target.checked)}
                className="mr-2"
              />
              종일
            </label>
            <input
              type={form.allDay ? 'date' : 'datetime-local'}
              className="border p-2 w-full mb-2"
              value={form.start}
              onChange={(e) => handleFormChange('start', e.target.value)}
            />
            <input
              type={form.allDay ? 'date' : 'datetime-local'}
              className="border p-2 w-full mb-2"
              value={form.end}
              onChange={(e) => handleFormChange('end', e.target.value)}
            />
            <div className="flex justify-end space-x-2">
              <button
                className="bg-gray-300 px-3 py-1 rounded"
                onClick={closePopup}
              >
                취소
              </button>
              <button
                className="bg-blue-500 text-white px-3 py-1 rounded"
                onClick={saveEvent}
              >
                저장
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

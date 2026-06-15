import { EventEnhancer } from '../../../core/EventEnhancer';
import { DEFAULT_SETTINGS } from '../../../types/settings';
import {
  getCleanTaskTitle,
  taskToCalendarTask,
  TasksPluginTask,
  tasksToCalendarTasks
} from '../taskPayloadAdapter';

const taskDate = (date: string) => ({
  toDate: () => new Date(`${date}T00:00:00`)
});

describe('taskPayloadAdapter', () => {
  it('keeps only the user title while minimally stripping known Tasks metadata', () => {
    const task = {
      path: 'Daily.md',
      description:
        '#task Wellness - Task 2 - edit 2 🔽 ➕ 2026-05-02 🛫 2026-04-30 (1:00 AM-3:00 AM)',
      taskLocation: { lineNumber: 2 },
      originalMarkdown:
        '- [x] #task Wellness - Task 2 - edit 2 🔽 ➕ 2026-05-02 🛫 2026-04-30 (1:00 AM-3:00 AM) ⏳ 2026-04-30 ✅ 2026-05-02',
      _scheduledDate: taskDate('2026-04-30'),
      _doneDate: taskDate('2026-05-02'),
      statusCharacter: 'x'
    } satisfies TasksPluginTask;

    expect(getCleanTaskTitle(task)).toEqual({
      title: 'Wellness - Task 2 - edit 2',
      startTime: '1:00 AM',
      endTime: '3:00 AM'
    });
  });

  it('preserves the category-title convention for the existing enhancer', () => {
    const task = {
      path: 'Daily.md',
      description:
        '#task Wellness - Task 2 - edit 2 🔽 ➕ 2026-05-02 🛫 2026-04-30 (1:00 AM-3:00 AM)',
      taskLocation: { lineNumber: 2 },
      originalMarkdown:
        '- [ ] #task Wellness - Task 2 - edit 2 🔽 ➕ 2026-05-02 🛫 2026-04-30 (1:00 AM-3:00 AM) ⏳ 2026-04-30',
      scheduledDate: taskDate('2026-04-30')
    } satisfies TasksPluginTask;

    const calendarTask = taskToCalendarTask(task);
    const enhanced = new EventEnhancer({
      ...DEFAULT_SETTINGS,
      enableAdvancedCategorization: true,
      categorySettings: [{ name: 'Wellness', color: '#448844' }]
    }).enhance({
      type: 'single',
      title: calendarTask.title,
      allDay: false,
      date: '2026-04-30',
      endDate: null,
      startTime: calendarTask.startTime!,
      endTime: calendarTask.endTime!,
      completed: false,
      uid: calendarTask.id
    });

    expect(enhanced).toMatchObject({
      category: 'Wellness',
      title: 'Task 2 - edit 2'
    });
  });

  it('uses private date fields when the Tasks payload exposes dates that way', () => {
    const task = {
      path: 'Daily.md',
      description: '#task Task 1',
      taskLocation: { lineNumber: 0 },
      originalMarkdown: '- [ ] #task Task 1 ⏳ 2025-10-06',
      _scheduledDate: taskDate('2025-10-06')
    } satisfies TasksPluginTask;

    expect(taskToCalendarTask(task).scheduledDate?.toISOString()).toBe(
      new Date('2025-10-06T00:00:00').toISOString()
    );
  });

  it('recovers persisted scheduling dates from markdown when cache date fields are absent', () => {
    const task = {
      path: 'Daily.md',
      description: '#task Persisted dates',
      taskLocation: { lineNumber: 0 },
      originalMarkdown: '- [ ] #task Persisted dates 🛫 2026-05-01 ⏳ 2026-05-02 📅 2026-05-03'
    } satisfies TasksPluginTask;

    const calendarTask = taskToCalendarTask(task);

    expect(calendarTask.startDate?.toISOString()).toBe(
      new Date('2026-05-01T00:00:00').toISOString()
    );
    expect(calendarTask.scheduledDate?.toISOString()).toBe(
      new Date('2026-05-02T00:00:00').toISOString()
    );
    expect(calendarTask.dueDate?.toISOString()).toBe(new Date('2026-05-03T00:00:00').toISOString());
  });

  it('deduplicates mirrored Tasks entries when native task id is shared', () => {
    const sourceTask = {
      id: '7f6c8f0d',
      path: 'Daily.md',
      description: '#task Mirrored task',
      taskLocation: { lineNumber: 4 },
      originalMarkdown: '- [ ] #task Mirrored task ⏳ 2026-05-11',
      scheduledDate: taskDate('2026-05-11')
    } satisfies TasksPluginTask;

    const mirroredTask = {
      ...sourceTask,
      path: 'Queries.md',
      taskLocation: { lineNumber: 27 }
    } satisfies TasksPluginTask;

    const mapped = tasksToCalendarTasks([sourceTask, mirroredTask]);

    expect(mapped).toHaveLength(1);
    expect(mapped[0].id).toBe('Daily.md::4');
  });
});

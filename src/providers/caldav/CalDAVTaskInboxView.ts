import { ItemView, setIcon, WorkspaceLeaf } from 'obsidian';
import { Draggable } from '@fullcalendar/interaction';
import FullCalendarPlugin from '../../main';
import { PluginState } from '../../core/PluginState';
import { CalDAVTaskCalendarInfo, CalDAVTaskInboxItem } from './CalDAVProvider';
import './caldav-task-inbox.css';

export const CALDAV_TASK_INBOX_VIEW_TYPE = 'caldav-task-inbox-view';

type CalDAVTaskProvider = {
  type: string;
  getTaskInboxCalendarInfo: () => CalDAVTaskCalendarInfo;
  getUndatedTasks: () => Promise<CalDAVTaskInboxItem[]>;
  createTask: (title: string) => Promise<CalDAVTaskInboxItem>;
  createLinkedNoteForTask: (task: CalDAVTaskInboxItem) => Promise<import('obsidian').TFile | null>;
};

type ProviderTask = CalDAVTaskInboxItem & {
  provider: CalDAVTaskProvider;
};

function encodeCalDAVTaskDragId(calendarId: string, uid: string): string {
  return `caldav::${encodeURIComponent(calendarId)}::${encodeURIComponent(uid)}`;
}

export class CalDAVTaskInboxView extends ItemView {
  private plugin: FullCalendarPlugin;
  private tasks: ProviderTask[] = [];
  private newTaskTitle = '';
  private selectedCalendarId = '';
  private isCreatingTask = false;
  private draggable: Draggable | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: FullCalendarPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return CALDAV_TASK_INBOX_VIEW_TYPE;
  }

  getDisplayText(): string {
    return 'CalDAV task inbox';
  }

  getIcon(): string {
    return 'list-checks';
  }

  onOpen(): Promise<void> {
    return (async () => {
      await this.loadTasks();
      this.render();
    })();
  }

  onClose(): Promise<void> {
    this.draggable?.destroy();
    this.draggable = null;
    return Promise.resolve();
  }

  public async refresh(): Promise<void> {
    await this.loadTasks();
    this.render();
  }

  private getCalDAVProviders(): CalDAVTaskProvider[] {
    return PluginState.getProviderRegistry()
      .getActiveProviders()
      .flatMap(provider => {
        const maybeProvider = provider as unknown as Partial<CalDAVTaskProvider>;
        return provider.type === 'caldav' &&
          typeof maybeProvider.getTaskInboxCalendarInfo === 'function' &&
          typeof maybeProvider.getUndatedTasks === 'function' &&
          typeof maybeProvider.createTask === 'function' &&
          typeof maybeProvider.createLinkedNoteForTask === 'function'
          ? [maybeProvider as CalDAVTaskProvider]
          : [];
      });
  }

  private async loadTasks(): Promise<void> {
    const providers = this.getCalDAVProviders();
    const results = await Promise.allSettled(
      providers.map(async provider => {
        const tasks = await provider.getUndatedTasks();
        return tasks.map(task => ({ ...task, provider }));
      })
    );

    this.tasks = results.flatMap(result => (result.status === 'fulfilled' ? result.value : []));
    this.ensureSelectedCalendar(providers);
  }

  private ensureSelectedCalendar(providers = this.getCalDAVProviders()): void {
    const settings = PluginState.getSettings();
    const persistedCalendarId = settings.caldavTaskInboxLastCalendarId;

    if (
      this.selectedCalendarId &&
      providers.some(provider => provider.getTaskInboxCalendarInfo().id === this.selectedCalendarId)
    ) {
      return;
    }

    if (
      persistedCalendarId &&
      providers.some(provider => provider.getTaskInboxCalendarInfo().id === persistedCalendarId)
    ) {
      this.selectedCalendarId = persistedCalendarId;
      return;
    }

    this.selectedCalendarId = providers[0]?.getTaskInboxCalendarInfo().id || '';
  }

  private persistSelectedCalendar(calendarId: string): void {
    const settings = PluginState.getSettings();
    if (settings.caldavTaskInboxLastCalendarId === calendarId) {
      return;
    }

    settings.caldavTaskInboxLastCalendarId = calendarId;
    void PluginState.saveSettings().catch(err =>
      console.warn('[CalDAVTaskInboxView] Failed to save selected task list.', err)
    );
  }

  private render(): void {
    const container = this.containerEl;
    container.empty();
    container.addClass('caldav-task-inbox-view');

    const header = container.createDiv({ cls: 'caldav-task-inbox-header' });
    header.createEl('h3', { text: 'CalDAV task inbox' });
    header.createDiv({
      text: `${this.tasks.length} unscheduled ${this.tasks.length === 1 ? 'task' : 'tasks'}`,
      cls: 'caldav-task-inbox-count'
    });

    this.renderCreateTaskForm(container);

    if (this.tasks.length === 0) {
      this.renderEmptyState(container);
      return;
    }

    this.renderTaskList(container);
  }

  private renderCreateTaskForm(container: HTMLElement): void {
    const providers = this.getCalDAVProviders();
    this.ensureSelectedCalendar(providers);

    const form = container.createEl('form', { cls: 'caldav-task-inbox-create-form' });
    form.addEventListener('submit', event => {
      event.preventDefault();
      void this.createTask();
    });

    const select = form.createEl('select', {
      cls: 'caldav-task-inbox-tasklist',
      attr: {
        'aria-label': 'CalDAV task list'
      }
    });
    select.disabled = providers.length === 0 || this.isCreatingTask;

    for (const provider of providers) {
      const calendar = provider.getTaskInboxCalendarInfo();
      const option = select.createEl('option', {
        text: calendar.name,
        attr: { value: calendar.id }
      });
      option.selected = calendar.id === this.selectedCalendarId;
    }

    select.addEventListener('change', () => {
      this.selectedCalendarId = select.value;
      this.persistSelectedCalendar(select.value);
    });

    const titleInput = form.createEl('input', {
      cls: 'caldav-task-inbox-new-title',
      attr: {
        type: 'text',
        placeholder: 'New task',
        'aria-label': 'New CalDAV task name'
      }
    });
    const addButton = form.createEl('button', {
      cls: 'caldav-task-inbox-add',
      attr: {
        type: 'submit',
        'aria-label': 'Add CalDAV task'
      }
    });
    setIcon(addButton, 'plus');
    addButton.disabled =
      providers.length === 0 || this.isCreatingTask || this.newTaskTitle.trim().length === 0;

    titleInput.value = this.newTaskTitle;
    titleInput.disabled = providers.length === 0 || this.isCreatingTask;
    titleInput.addEventListener('input', () => {
      this.newTaskTitle = titleInput.value;
      addButton.disabled =
        providers.length === 0 || this.isCreatingTask || this.newTaskTitle.trim().length === 0;
    });
  }

  private renderEmptyState(container: HTMLElement): void {
    const empty = container.createDiv({ cls: 'caldav-task-inbox-empty' });
    empty.createDiv({ text: 'No unscheduled CalDAV tasks.' });
    empty.createDiv({
      text: 'Tasks with no DTSTART or DUE will appear here.',
      cls: 'caldav-task-inbox-help'
    });
  }

  private renderTaskList(container: HTMLElement): void {
    const list = container.createDiv({ cls: 'caldav-task-inbox-list' });

    for (const task of this.tasks) {
      const item = list.createDiv({
        cls: 'caldav-task-inbox-item',
        attr: {
          draggable: 'true',
          'data-task-id': encodeCalDAVTaskDragId(task.calendarId, task.uid)
        }
      });

      const titleRow = item.createDiv({ cls: 'caldav-task-inbox-title-row' });
      const checkbox = titleRow.createEl('input', {
        cls: 'caldav-task-inbox-checkbox',
        attr: { type: 'checkbox' }
      });
      checkbox.checked = task.completed;
      checkbox.disabled = true;

      titleRow.createSpan({
        text: task.title,
        cls: task.completed
          ? 'caldav-task-inbox-title caldav-task-inbox-done'
          : 'caldav-task-inbox-title'
      });

      item.createDiv({
        text: task.calendarName,
        cls: 'caldav-task-inbox-calendar'
      });

      const actions = item.createDiv({ cls: 'caldav-task-inbox-actions' });
      const openNoteButton = actions.createEl('button', {
        cls: 'caldav-task-inbox-action',
        attr: { 'aria-label': `Open note for ${task.title}` }
      });
      setIcon(openNoteButton, 'file-text');
      openNoteButton.addEventListener('click', event => {
        event.stopPropagation();
        void this.openTaskNote(task);
      });
    }

    this.draggable?.destroy();
    this.draggable = new Draggable(list, {
      itemSelector: '.caldav-task-inbox-item'
    });
  }

  private async createTask(): Promise<void> {
    const title = this.newTaskTitle.trim();
    if (!title || this.isCreatingTask) {
      return;
    }

    const provider = this.getCalDAVProviders().find(
      candidate => candidate.getTaskInboxCalendarInfo().id === this.selectedCalendarId
    );
    if (!provider) {
      return;
    }

    this.isCreatingTask = true;
    this.render();

    try {
      const task = await provider.createTask(title);
      this.newTaskTitle = '';
      this.tasks = [
        { ...task, provider },
        ...this.tasks.filter(existingTask => existingTask.uid !== task.uid)
      ];
    } catch (err) {
      console.warn('[CalDAVTaskInboxView] Failed to create CalDAV task.', err);
    } finally {
      this.isCreatingTask = false;
      this.render();
      this.containerEl.querySelector<HTMLInputElement>('.caldav-task-inbox-new-title')?.focus();
    }
  }

  private async openTaskNote(task: ProviderTask): Promise<void> {
    const file = await task.provider.createLinkedNoteForTask(task);
    if (!file) {
      return;
    }

    const leaf = this.plugin.app.workspace.getLeaf(false);
    await leaf.openFile(file);
  }
}

import { WorkspaceLeaf } from 'obsidian';
import FullCalendarPlugin from '../../main';
import { CalDAVTaskInboxView, CALDAV_TASK_INBOX_VIEW_TYPE } from './CalDAVTaskInboxView';

export class CalDAVTaskInboxManager {
  private plugin: FullCalendarPlugin;
  private isLoaded = false;

  constructor(plugin: FullCalendarPlugin) {
    this.plugin = plugin;
  }

  public onload(): void {
    if (this.isLoaded) {
      return;
    }

    this.isLoaded = true;

    this.plugin.registerView(
      CALDAV_TASK_INBOX_VIEW_TYPE,
      (leaf: WorkspaceLeaf) => new CalDAVTaskInboxView(leaf, this.plugin)
    );

    this.plugin.addCommand({
      id: 'open-caldav-task-inbox',
      name: 'Open CalDAV task inbox',
      callback: () => {
        void this.openInboxView();
      }
    });

    this.plugin.addRibbonIcon('list-checks', 'CalDAV task inbox', () => {
      void this.openInboxView();
    });
  }

  public onunload(): void {
    if (!this.isLoaded) {
      return;
    }

    this.isLoaded = false;
    this.closeAllInboxViews();
  }

  public refreshViews(): void {
    const leaves = this.plugin.app.workspace.getLeavesOfType(CALDAV_TASK_INBOX_VIEW_TYPE);

    for (const leaf of leaves) {
      const view = leaf.view;
      if (view instanceof CalDAVTaskInboxView) {
        void view.refresh();
      }
    }
  }

  public getIsLoaded(): boolean {
    return this.isLoaded;
  }

  private async openInboxView(): Promise<void> {
    const workspace = this.plugin.app.workspace;
    const existingLeaf = workspace.getLeavesOfType(CALDAV_TASK_INBOX_VIEW_TYPE)[0];
    if (existingLeaf) {
      void workspace.revealLeaf(existingLeaf);
      return;
    }

    const leaf = workspace.getRightLeaf(false);
    if (!leaf) {
      return;
    }

    await leaf.setViewState({
      type: CALDAV_TASK_INBOX_VIEW_TYPE,
      active: true
    });

    void workspace.revealLeaf(leaf);
  }

  private closeAllInboxViews(): void {
    const leaves = this.plugin.app.workspace.getLeavesOfType(CALDAV_TASK_INBOX_VIEW_TYPE);
    for (const leaf of leaves) {
      leaf.detach();
    }
  }
}

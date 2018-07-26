import * as vscode from 'vscode';
import * as vsls from 'vsls/vscode';
import { TestExplorerExtension } from 'vscode-test-adapter-api';
import { HostSession } from './hostSession';
import { GuestSession } from './guestSession';

export const serviceName = 'hbenl.vscode-share-test-explorer';

export interface Session {
	dispose(): void;
}

export class SessionManager {

	private currentSession: Session | undefined;

	constructor(
		private readonly channel: vscode.OutputChannel,
		private readonly testExplorer: TestExplorerExtension,
		private readonly liveShare: vsls.LiveShare
	) {}

	onSessionChanged(session: vsls.Session): void {

		this.channel.appendLine(`Session changed: ${JSON.stringify(session)}`);

		if (this.currentSession) {
			this.currentSession.dispose();
			this.currentSession = undefined;
		}

		if (session.id && (session.role !== vsls.Role.None)) {

			if (session.role === vsls.Role.Host) {

				this.currentSession = new HostSession(this.channel, this.testExplorer, this.liveShare);

			} else if (session.role === vsls.Role.Guest) {

				this.currentSession = new GuestSession(this.channel, this.testExplorer, this.liveShare);

			}
		}
	}
}

import * as vscode from 'vscode';
import { testExplorerExtensionId, TestExplorerExtension } from 'vscode-test-adapter-api';
import * as vsls from 'vsls/vscode';
import { SessionManager } from './sessionManager';

export function activate(context: vscode.ExtensionContext): void {
	initAsync();
}

async function initAsync(): Promise<void> {

	const channel = vscode.window.createOutputChannel('Share Test Explorer');

	channel.appendLine('Looking for Test Explorer');

	const testExplorerExt = vscode.extensions.getExtension<TestExplorerExtension>(testExplorerExtensionId);
	const testExplorer = testExplorerExt ? testExplorerExt.exports : undefined;

	channel.appendLine(`Test Explorer ${testExplorer ? '' : 'not '}found`);

	if (!testExplorer) return;

	channel.appendLine('Looking for VSLS');

	const liveShare = await vsls.getApiAsync();

	channel.appendLine(`VSLS ${liveShare ? '' : 'not '}found`);

	if (!liveShare) return;

	const sessionManager = new SessionManager(channel, testExplorer, liveShare);

	liveShare.onDidChangeSession(event => {
		sessionManager.onSessionChanged(event.session);
	});
	sessionManager.onSessionChanged(liveShare.session);
}

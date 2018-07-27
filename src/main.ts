import * as vscode from 'vscode';
import { testExplorerExtensionId, TestExplorerExtension } from 'vscode-test-adapter-api';
import * as vsls from 'vsls/vscode';
import { SessionManager } from './sessionManager';
import { Log } from './log';

export function activate(context: vscode.ExtensionContext): void {
	initAsync();
}

async function initAsync(): Promise<void> {

	const log = new Log('Share Test Explorer');

	log.info('Looking for Test Explorer');

	const testExplorerExt = vscode.extensions.getExtension<TestExplorerExtension>(testExplorerExtensionId);
	const testExplorer = testExplorerExt ? testExplorerExt.exports : undefined;

	log.info(`Test Explorer ${testExplorer ? '' : 'not '}found`);

	if (!testExplorer) return;

	log.info('Looking for VSLS');

	const liveShare = await vsls.getApiAsync();

	log.info(`VSLS ${liveShare ? '' : 'not '}found`);

	if (!liveShare) return;

	const sessionManager = new SessionManager(testExplorer, liveShare, log);

	liveShare.onDidChangeSession(event => {
		sessionManager.onSessionChanged(event.session);
	});
	sessionManager.onSessionChanged(liveShare.session);
}

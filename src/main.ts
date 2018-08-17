import * as vscode from 'vscode';
import { testExplorerExtensionId, TestExplorerExtension } from 'vscode-test-adapter-api';
import * as vsls from 'vsls/vscode';
import { Log } from './log';
import { HostSessionManager } from './hostSession';
import { GuestSessionManager } from './guestSession';

export const serviceName = 'test-explorer';

export function activate(context: vscode.ExtensionContext): void {
	activateAsync(context);
}

async function activateAsync(context: vscode.ExtensionContext): Promise<void> {

	const log = new Log('Test Explorer Live Share');

	log.info('Looking for Test Explorer');
	const testExplorerExt = vscode.extensions.getExtension<TestExplorerExtension>(testExplorerExtensionId);
	const testExplorer = testExplorerExt ? testExplorerExt.exports : undefined;
	log.info(`Test Explorer ${testExplorer ? '' : 'not '}found`);
	if (!testExplorer) return;

	log.info('Looking for VSLS');
	const liveShare = await vsls.getApiAsync();
	log.info(`VSLS ${liveShare ? '' : 'not '}found`);
	if (!liveShare) return;

	log.info('Trying to create shared service');
	const sharedService = await liveShare.shareService(serviceName);
	log.info(`Shared service ${sharedService ? '' : 'not '}created`);
	if (!sharedService) return;

	log.info('Trying to get shared service proxy');
	const sharedServiceProxy = await liveShare.getSharedService(serviceName);
	log.info(`Shared service proxy ${sharedServiceProxy ? '' : 'not '}found`);
	if (!sharedServiceProxy) return;

	new HostSessionManager(context, testExplorer, liveShare, sharedService, log);
	new GuestSessionManager(context, testExplorer, sharedServiceProxy, log);

	context.subscriptions.push({ dispose() { liveShare.unshareService(serviceName); } });
}

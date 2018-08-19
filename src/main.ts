import * as vscode from 'vscode';
import { testExplorerExtensionId, TestHub } from 'vscode-test-adapter-api';
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
	const testExplorerExtension = vscode.extensions.getExtension<TestHub>(testExplorerExtensionId);
	const testHub = testExplorerExtension ? testExplorerExtension.exports : undefined;
	log.info(`Test Hub ${testHub ? '' : 'not '}found`);
	if (!testHub) return;

	log.info('Looking for VSLS');
	const liveShare = await vsls.getApiAsync();
	log.info(`VSLS ${liveShare ? '' : 'not '}found`);
	if (!liveShare) return;

	log.info('Trying to create shared service');
	const sharedService = await liveShare.shareService(serviceName);
	log.info(`Shared service ${sharedService ? '' : 'not '}created`);
	if (!sharedService) {
		vscode.window.showErrorMessage('Could not create a shared service. You have to set "liveshare.features" to "experimental" in your user settings in order to use this extension.');
		return;
	}

	log.info('Trying to get shared service proxy');
	const sharedServiceProxy = await liveShare.getSharedService(serviceName);
	log.info(`Shared service proxy ${sharedServiceProxy ? '' : 'not '}found`);
	if (!sharedServiceProxy) {
		vscode.window.showErrorMessage('Could not access a shared service. You have to set "liveshare.features" to "experimental" in your user settings in order to use this extension.');
		return;
	}

	new HostSessionManager(context, testHub, liveShare, sharedService, log);
	new GuestSessionManager(context, testHub, sharedServiceProxy, log);

	context.subscriptions.push({ dispose() { liveShare.unshareService(serviceName); } });
}

import * as vsls from 'vsls/vscode';
import { TestExplorerExtension, TestController, TestAdapterDelegate } from 'vscode-test-adapter-api';
import { Session, serviceName } from './sessionManager';
import { Log } from './log';

export class HostSession implements Session, TestController {

	private sharedService: vsls.SharedService | undefined;

	private adapters = new Map<number, TestAdapterDelegate>();
	private nextAdapterId = 0;

	constructor(
		private readonly testExplorer: TestExplorerExtension,
		private readonly liveShare: vsls.LiveShare,
		private readonly log: Log
	) {
		this.log.info('Starting HostSession');
		this.init();
	}

	async init(): Promise<void> {

		this.log.info('Sharing service');
		const service = await this.liveShare.shareService(serviceName);
		if (service) {

			this.sharedService = service;

			this.log.info(`sharedService is ${service.isServiceAvailable ? '' : 'not '}available`);

			this.sharedService.onRequest('adapters', () => {
				this.log.debug('Received adapters request');
				const adapters = [ ...this.adapters.keys() ];
				this.log.debug(`Sending adapters response: ${JSON.stringify(adapters)}`);
				return Promise.resolve(adapters);
			});

			this.sharedService.onRequest('load', (args) => {
				this.log.debug('Received load request...');
				return this.adapterRequest(args, adapter => adapter.load());
			});

			this.sharedService.onRequest('run', (args) => {
				this.log.debug('Received run request...');
				return this.adapterRequest(args, adapter => adapter.run(args[1]));
			});

			this.sharedService.onRequest('debug', (args) => {
				this.log.debug('Received debug request...');
				return this.adapterRequest(args, adapter => adapter.debug(args[1]));
			});

			this.sharedService.onRequest('cancel', (args) => {
				this.log.debug('Received cancel request...');
				this.adapterRequest(args, adapter => adapter.cancel());
			});

			this.testExplorer.registerController(this);

		} else {
			this.log.error('Sharing service failed');
		}
	}

	registerAdapterDelegate(adapter: TestAdapterDelegate): void {
		if (!this.sharedService) return;

		const adapterId = this.nextAdapterId++;
		this.log.info(`Registering Adapter #${adapterId}`);
		this.adapters.set(adapterId, adapter);

		adapter.tests(event => this.sharedService!.notify('tests', { adapterId, event }))
		adapter.testStates(event => this.sharedService!.notify('testState', { adapterId, event }));

		this.sharedService.notify('registerAdapter', { adapterId });
	}

	unregisterAdapterDelegate(adapter: TestAdapterDelegate): void {
		if (!this.sharedService) return;

		for (const [ adapterId, _adapter ] of this.adapters) {
			if (_adapter === adapter) {
				this.log.info(`Unregistering Adapter #${adapterId}`);
				this.sharedService.notify('unregisterAdapter', { adapterId });
				this.adapters.delete(adapterId);
				return;
			}
		}

		this.log.warn('Tried to unregister unknown Adapter');
	}

	private adapterRequest(args: any[], action: (adapter: TestAdapterDelegate) => any): any {

		const adapterId = args[0];
		const adapter = this.adapters.get(adapterId);
		if (adapter) {
			this.log.debug(`...for adapter #${adapterId}`);
			return action(adapter);
		} else {
			this.log.warn(`...for unknown adapter #${adapterId}`);
		}

		return undefined;
	}

	dispose(): void {
		this.log.info('Disposing HostSession');
		this.testExplorer.unregisterController(this);
		this.liveShare.unshareService(serviceName);
		this.sharedService = undefined;
	}
}

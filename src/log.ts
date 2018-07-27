import * as vscode from 'vscode';

export class Log {

	private outputChannel: vscode.OutputChannel;

	constructor(outputChannelName: string) {
		this.outputChannel = vscode.window.createOutputChannel(outputChannelName);
	}

	debug(msg: string): void {
		this.log(msg, 'DEBUG');
	}

	info(msg: string): void {
		this.log(msg, 'INFO');
	}

	warn(msg: string): void {
		this.log(msg, 'WARN');
	}

	error(msg: string): void {
		this.log(msg, 'ERROR');
	}

	dispose(): void {
		this.outputChannel.dispose();
	}

	private log(msg: string, logLevel: string) {
		const dateString = new Date().toISOString().replace('T', ' ').replace('Z', '');
		this.outputChannel.appendLine(`[${dateString}] [${logLevel}] ${msg}`);
	}
}

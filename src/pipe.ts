import { Duplex } from 'stream';
import type { LinkRPCConnection } from './connection.js';

class LinkRPCChannelPipe extends Duplex {

    private connection: LinkRPCConnection;
    private channel: string;
    private removeBinaryListener: (() => void) | null = null;

    constructor(connection: LinkRPCConnection, channel: string) {
        super();
        this.connection = connection;
        this.channel = channel;

        const handler = (ch: string, data: Uint8Array) => {
            if (ch !== this.channel) return;
            if (data.length === 0) {
                this.push(null);
                return;
            }
            if (!this.push(data)) {
                // internal buffer full, data queued

            }
        };
        this.connection.emitter.on('binary', handler);
        this.removeBinaryListener = () => {
            this.connection.emitter.off('binary', handler);
        };
    }

    public getChannel():string{
        return this.channel;
    }

    public getConnection():LinkRPCConnection{
        return this.connection;
    }

    _read(_size: number): void {
        // data is pushed from the binary event handler
    }

    _write(chunk: any, _encoding: string, callback: (error?: Error | null) => void): void {
        const data: Uint8Array = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
        this.connection.sendBinary(this.channel, data)
            .then(() => callback())
            .catch((err) => callback(err instanceof Error ? err : new Error(String(err))));
    }

    _final(callback: (error?: Error | null) => void): void {
        this.connection.sendBinary(this.channel, new Uint8Array(0))
            .then(() => callback())
            .catch((err) => callback(err instanceof Error ? err : new Error(String(err))));
    }

    _destroy(error: Error | null, callback: (error: Error | null) => void): void {
        if (this.removeBinaryListener) {
            this.removeBinaryListener();
            this.removeBinaryListener = null;
        }
        callback(error);
    }
}

export {
    LinkRPCChannelPipe
}

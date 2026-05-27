import type { LinkRPCConnection } from './connection.js';

class LinkRPCChannelPipe {
    constructor(_connection: LinkRPCConnection, _channel: string) {
        throw new Error('LinkRPCChannelPipe requires Node.js stream module and is not available in browser environments');
    }
}

export {
    LinkRPCChannelPipe
}

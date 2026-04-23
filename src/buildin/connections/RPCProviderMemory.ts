import { RPCConnection } from "../../connection.js";
import type { RPCPacket } from "../../packet.js";
import { RPCProvider } from "../../provider.js";

class RPCConnectionMemory extends RPCConnection{
    
    private closed = false;
    private target?:RPCConnectionMemory;

    public setTarget(target:RPCConnectionMemory){
        this.target = target;
    }

    send(packet: RPCPacket): Promise<void> {
        if(!this.target){
            throw new Error("target is not set");
        }
        this.target.emitter.emit('receive',packet);
        return Promise.resolve();
    }

    close(): Promise<void> {
        if(this.closed){
            throw new Error("connection is closed");
        }
        this.closed = true;
        this.emitter.emit('closed');
        return Promise.resolve();
    }
    isClosed(): boolean {
        return this.closed;
    }
    
}

const RPCProviderMemoryGlobal = new Map<number,RPCProviderMemory>();

class RPCProviderMemory extends RPCProvider{

    private usePort?:number;

    listen(params?: { hostname?: string | undefined; port?: number | undefined; }): Promise<void> {
        if(!params || !params.port){
            throw new Error("port is required");
        }
        this.usePort = params.port;
        if(RPCProviderMemoryGlobal.has(this.usePort)){
            throw new Error("port is used");
        }
        RPCProviderMemoryGlobal.set(params.port,this);
        return Promise.resolve();
    }

    close(): Promise<void> {
        if(!this.usePort){
            throw new Error("port is not set");
        }
        RPCProviderMemoryGlobal.delete(this.usePort);
        return Promise.resolve();
    }

    async connect(params?: { hostname?: string | undefined; port?: number | undefined; }): Promise<RPCConnection> {
        if(!params?.port){
            throw new Error("port is required");
        }
        const targetProvider = RPCProviderMemoryGlobal.get(params.port);
        if(!targetProvider){
            throw new Error("connect filed port not found");
        }
        
        const connection = new RPCConnectionMemory();
        await targetProvider.onConnect(connection);
        return connection;
    }

    public async onConnect(target:RPCConnectionMemory){
        const connection = new RPCConnectionMemory();
        connection.setTarget(target);
        target.setTarget(connection);
        this.emitter.emit('connection',connection);
    }

}

export {
    RPCProviderMemory
}
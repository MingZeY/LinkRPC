import { LinkRPCBuildin, LinkRPCConnection, LinkRPCPacketFactory } from "../src/index.js";
import { TestCase } from "./TestCase.js";

export default class TestConnection extends TestCase{
    name(): string {
        return "Connection";
    }

    async run(): Promise<boolean> {
        const providerServer = new LinkRPCBuildin.provider.socket();
        await providerServer.listen({
            port:3060,
        })

        const connectionToClient:Promise<LinkRPCConnection> = new Promise<LinkRPCConnection>((resolve) => {
            providerServer.emitter.once('connection',(connection) => {
                resolve(connection);
            })
        })

        const providerClient = new LinkRPCBuildin.provider.socket();
        const connectionToServer:Promise<LinkRPCConnection> = providerClient.connect({
            port:3060,
        })

        await Promise.all([connectionToClient,connectionToServer])

        const resultFromClient = new Promise((resolve) => {
            connectionToClient.then(connection => connection.emitter.on('receive',(packet) => {
                if(LinkRPCPacketFactory.isRequestPacket(packet)
                && packet.args[0] == 'hello from client'
                ){
                    resolve(true);
                }
            }))
        })

        const resultFromServer = new Promise((resolve) => {
            connectionToServer.then(connection => connection.emitter.on('receive',(packet) => {
                if(LinkRPCPacketFactory.isRequestPacket(packet)
                && packet.args[0] == 'hello from server'
                ){
                    resolve(true);
                }
            }))
        })

        connectionToServer.then(connection => connection.send(LinkRPCPacketFactory.createRequestPacket({
            serviceName:'',
            methodName:'',
            args:['hello from client']
        })))

        connectionToClient.then(connection => connection.send(LinkRPCPacketFactory.createRequestPacket({
            serviceName:'',
            methodName:'',
            args:['hello from server']
        })))

        const results = await Promise.all([resultFromClient,resultFromServer]);
        this.asert({
            handler:() => results.every((result) => result),
        })

        await connectionToClient.then(c => c.close())
        await connectionToServer.then(c => c.close())
        await providerServer.close();
        return true;
    }
    
}
import { LinkRPCHub } from "../src/hub.js";
import { LinkRPCConnection, LinkRPCHandler, LinkRPCPacketFactory, type LinkRPCPacket } from "../src/index.js";
import { TestCase } from "./TestCase.js";



export default class TestHub extends TestCase{
    name(): string {
        return "Hub";
    }

    async run(): Promise<boolean> {
        const handler = new LinkRPCHandler();
        handler.hook('math','add',{
            handler(a,b) {
                return a + b;
            },
        })

        class LocalConnection extends LinkRPCConnection{
            
            private target?:LocalConnection | undefined;
            constructor(){
                super();
            }

            public setTarget(target:LocalConnection){
                this.target = target;
            }

            async send(packet: LinkRPCPacket): Promise<void> {
                if(!this.target){
                    throw new Error('LocalConnection target is not set');
                }
                this.target.emitter.emit('receive',packet);
                return;
            }

            async close(): Promise<void> {
                this.target = undefined;
            }

            isClosed(): boolean {
                return this.target === undefined;
            }
        }

        const connctionA = new LocalConnection();
        const connectionB = new LocalConnection();

        // Connect both connections
        connctionA.setTarget(connectionB);
        connectionB.setTarget(connctionA);

        const hubA = new LinkRPCHub({
            handler:handler,
        });
        connctionA.emitter.on('receive',(packet) => {
            hubA.inbound(connctionA,packet);
        })

        const hubB = new LinkRPCHub({
            handler:new LinkRPCHandler(),
        });
        connectionB.emitter.on('receive',(packet) => {
            hubB.inbound(connectionB,packet);
        })

        const response = await hubB.request(connectionB,LinkRPCPacketFactory.createRequestPacket({
            serviceName:'math',
            methodName:'add',
            args:[1,2]
        }),{
            timeout:1000
        })

        this.asert({
            handler:() => response.result == 3,
            desc:"Response result is not 3",
        })

        return true;
    }   
}
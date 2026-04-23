import { LinkRPCConnection, LinkRPCCore, LinkRPCHandler, LinkRPCPacketFactory, type LinkRPCPacket } from "../src/index.js";
import { TestCase } from "./TestCase.js";



export default class TestServerReverseCall extends TestCase{
    name(): string {
        return "ServerReverseCall";
    }

    async run(): Promise<boolean> {

        

        return true;
    }   
}
import { LinkRPCAPIDefine, LinkRPCInterface, LinkRPCPacketFactory } from "../src/index.js";
import { TestCase } from "./TestCase.js";

export default class TestInterface extends TestCase {
    name(): string {
        return "Interface";
    }
    async run(): Promise<boolean> {

        let define = new LinkRPCAPIDefine<{
            Math: {
                add(a: number, b: number): number
            },
            String:{
                concat(a:string,b:string):string
            }
        }>();

        type InterfaceConfig = {
            timeout:number
        }

        let interfaces = new LinkRPCInterface<typeof define,InterfaceConfig>(async (target) => {
            if(target.service == 'Math'
            && target.method == 'add'
            ){
                return target.args[0] + target.args[1];
            }
            if(target.service == 'String'
            && target.method == 'concat'
            ){
                return target.args[0] + target.args[1];
            }

            throw new Error('not found method');
        },{           
            timeout:1000,
        });

        const r1 = await interfaces.Math.add(1,2);
        const r2 = await interfaces.Math.add.request([2,3],{
            timeout:1000,
        });
        const r3 = await interfaces.String.concat('a','b');
        const r4 = await interfaces.request({
            service:'Math',
            method:'add',
            args:[3,4]
        })
        
        this.asert({
            handler:() => r1 == 3,
            desc:'Math.add(1,2) == 3',
        })
        this.asert({
            handler:() => r2 == 5,
            desc:'Math.add(2,3) == 5',
        })
        this.asert({
            handler:() => r3 == 'ab',
            desc:'String.concat("a","b") == "ab"',
        })
        this.asert({
            handler:() => r4 == 7,
            desc:'Math.add(3,4) == 7'
        })

        return Promise.resolve(true);
    }
}
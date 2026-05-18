
import { LinkRPCSchemaBuilder } from "../src/schema.js";
import { TestCase } from "./TestCase.js";

export default class TestSchema extends TestCase{
    name(): string {
        return "Schema";
    }
    async run(): Promise<boolean> {
        const t = new LinkRPCSchemaBuilder()

        const numberSchema = t.number()
        const numberValue =  numberSchema.parse(-1);
        this.asert({handler:() => numberValue === -1});

        const stringSchema = t.string()
        const stringValue = stringSchema.parse("123");
        this.asert({handler:() => stringValue === "123"});

        const booleanSchema = t.boolean()
        const booleanValue = booleanSchema.parse(true);
        this.asert({handler:() => booleanValue === true});


        const anySchema = t.any()
        const anyValue = anySchema.parse("123");
        this.asert({handler:() => anyValue === "123"});

        const AgeField = t.number().min(0).max(99);
        const RecordAgeFieldParent = AgeField.copy('parentAge');
        const recordSchema = t.object({
            name:t.string(),
            age:RecordAgeFieldParent,
            pos:t.tuple(t.number(),t.number()),
            female:t.boolean(),
            child:t.array(t.object({
                name:t.string(),
                age:AgeField.copy().setValidator((value,handler) => {
                    const parentAge = handler.getValueByField(RecordAgeFieldParent);
                    return value < parentAge;
                })
            }))
        });

        const objValue = recordSchema.parse(JSON.stringify({
            name:"test",
            age:18,
            female:false,
            pos:[1,2],
            child:[{
                name:"child0",
                age:10,
            }],
        }))
        
        this.asert({handler:() => objValue.name === "test"});
        this.asert({handler:() => objValue.age === 18});
        this.asert({handler:() => objValue.child[0]?.name === "child0"});
        this.asert({handler:() => objValue.child[0]?.age === 10});

        t.args(t.object({
            indexes:t.record(t.string(),t.or(t.string(),t.undefined())).optional()
        })).parse([{indexes: {username: "MingZeY"}}])

        return true;
    }

}
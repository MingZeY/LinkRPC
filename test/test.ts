import { TestCase } from './TestCase.js';

const testList = [
    import('./Handler.js'),
    import('./Core.js'),
    import('./Client.js'),
    import('./BuildinHTTP.js'),
    import('./BuildinSocket.js'),
    import('./BuildinSocketIO.js'),
    import('./BuildinWebsocket.js'),
    import('./Middleware.js'),
    import('./Context.js'),
    import('./Connection.js'),
]

const tests:Array<TestCase> = [];

async function main() {
    for(let i of testList){
        let exp = await i;
        let test = new (exp.default)() as TestCase;
        tests.push(test);

        process.stdout.write(`\x1b[34m[S]\x1b[0m ${test.name()}`);
        await test.run().catch((e:Error) => {
            test.asert({
                handler:() => false,
                desc:`Test:${test.name()} run failed.\n${e.stack || e}`,
                throw:false
            })
        })

        process.stdout.write(`\r\x1b[34m[E]\x1b[0m ${test.name()}`);
        await test.finally().catch((e) => {
            test.asert({
                handler:() => false,
                desc:`Test:${test.name()} finally failed, test fully stop.\n${e}`,
            })
        })

        if(test.aserts.length == 0){
            process.stdout.write(`\r\x1b[32m[P]\x1b[0m ${test.name()}\n`);
        }else{
            process.stdout.write(`\r\x1b[31m[F]\x1b[0m ${test.name()}\n`);
        }
    }
}

main().then(() => {
    console.log('LinkRPC test finished.');
}).catch((e) => {
    console.log(`LinkRPC test failed.\n${e}`);
    throw e;
}).finally(() => {
    console.log(`${'='.repeat(16)} SUMMARY ${'='.repeat(16)}`);
    console.log(`TOTAL:${tests.length} PASS:${tests.filter((test) => test.aserts.length == 0).length} FAIL:${tests.filter((test) => test.aserts.length > 0).length}`)
    for(let test of tests){
        if(test.aserts.length == 0){
            continue;
        }
        console.log(`Asserts in ${test.name()}:`);
        for(let assert of test.aserts){
            console.log(assert);
        }
    }
})
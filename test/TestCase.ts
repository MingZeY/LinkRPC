export abstract class TestCase{
    public aserts:Array<Error> = [];

    abstract name():string;
    abstract run():Promise<boolean>;
    public async finally():Promise<void>{};

    public asert(config:{
        handler:() => boolean,
        desc?:string,
        throw?:boolean
    }){
        if(!config.handler()){
            const e = new Error(config.desc ?? "Assert failed")
            this.aserts.push(e);
            if(config.throw != false){
                throw e;
            }
        }
    }
}


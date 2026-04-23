type RPCAPIDefineType = Record<string,Record<string,any>>
type RPCMethodConfig = {
    // timeout for this method
    timeout?:number | undefined;//ms
}


type RPCServiceConfig<T extends RPCAPIDefineType,S extends keyof T> = {
    methods?:{
        [M in keyof T[S]]?:RPCMethodConfig;
    }
    // default timeout for all methods in this service
    timeout?:number | undefined;//ms
}

type RPCDefineConfig<T extends RPCAPIDefineType> = {
    services?:{
        [S in keyof T]?:RPCServiceConfig<T,S>;
    },
    // default timeout for all services
    timeout?:number | undefined;
}

class RPCAPIDefine<T extends RPCAPIDefineType> {

    static RPCService = Symbol('RPCService');
    static RPCMethod = Symbol('RPCMethod');
    static RPCMethodList = Symbol('RPCMethodList');

    private config:RPCDefineConfig<T>;

    constructor(config?:RPCDefineConfig<T>){
        this.config = config || {};
    }

    static method(){
        return  function(target:any, propertyKey:string, descriptor:PropertyDescriptor){
            descriptor.value[RPCAPIDefine.RPCMethod] = true;
            if(!target[RPCAPIDefine.RPCService]){
                target[RPCAPIDefine.RPCService] = true;
            }
            if(!target[RPCAPIDefine.RPCMethodList]){
                target[RPCAPIDefine.RPCMethodList] = new Set<string>();
            }
            target[RPCAPIDefine.RPCMethodList].add(propertyKey);
        }
    }

    static isService(target:any){
        return target[RPCAPIDefine.RPCService] === true;
    }

    static isMethod(method:any){
        // 判断是否是方法
        if(typeof method !== 'function'){
            return false;
        }
        if(method[RPCAPIDefine.RPCMethod] != true){
            return false;
        }
        return true;
    }

    static getMethodList(service:any):string[]{
        if(!RPCAPIDefine.isService(service)){
            return [];
        }
        return Array.from(service[RPCAPIDefine.RPCMethodList]);
    }

    resolveMethodConfig<S extends keyof T,M extends keyof T[S]>(service:S,methodName:M):RPCMethodConfig|undefined{
        const serviceConfig = this.config.services?.[service];
        const methodConfig = serviceConfig?.methods?.[methodName];
        
        return {
            timeout: methodConfig?.timeout || serviceConfig?.timeout || this.config.timeout,
        }
    }
}


export {
    type RPCAPIDefineType,
    type RPCDefineConfig,
    type RPCServiceConfig,
    type RPCMethodConfig,
    RPCAPIDefine,
}
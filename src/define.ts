import { LinkRPCMethodListSymbol, LinkRPCMethodSymbol } from "./symbol.js";

import { LinkRPCServiceSymbol } from "./symbol.js";

type LinkRPCAPIDefineType = Record<string,Record<string,any>>
type LinkRPCMethodConfig = {
    // timeout for this method
    timeout?:number | undefined;//ms
}


type LinkRPCServiceConfig<T extends LinkRPCAPIDefineType,S extends keyof T> = {
    methods?:{
        [M in keyof T[S]]?:LinkRPCMethodConfig;
    }
    // default timeout for all methods in this service
    timeout?:number | undefined;//ms
}

type LinkRPCDefineConfig<T extends LinkRPCAPIDefineType> = {
    services?:{
        [S in keyof T]?:LinkRPCServiceConfig<T,S>;
    },
    // default timeout for all services
    timeout?:number | undefined;
}

class LinkRPCAPIDefine<T extends LinkRPCAPIDefineType> {

    private config:LinkRPCDefineConfig<T>;

    constructor(config?:LinkRPCDefineConfig<T>){
        this.config = config || {};
    }

    static method(){
        return  function(target:any, propertyKey:string, descriptor:PropertyDescriptor){
            descriptor.value[LinkRPCMethodSymbol] = true;
            if(!target[LinkRPCServiceSymbol]){
                target[LinkRPCServiceSymbol] = true;
            }
            if(!target[LinkRPCMethodListSymbol]){
                target[LinkRPCMethodListSymbol] = new Set<string>();
            }
            target[LinkRPCMethodListSymbol].add(propertyKey);
        }
    }

    static isService(target:any){
        return target[LinkRPCServiceSymbol] === true;
    }

    static isMethod(method:any){
        // 判断是否是方法
        if(typeof method !== 'function'){
            return false;
        }
        if(method[LinkRPCMethodSymbol] != true){
            return false;
        }
        return true;
    }

    static getMethodList(service:any):string[]{
        if(!LinkRPCAPIDefine.isService(service)){
            return [];
        }
        return Array.from(service[LinkRPCMethodListSymbol]);
    }

    resolveMethodConfig<S extends keyof T,M extends keyof T[S]>(service:S,methodName:M):LinkRPCMethodConfig|undefined{
        const serviceConfig = this.config.services?.[service];
        const methodConfig = serviceConfig?.methods?.[methodName];
        
        return {
            timeout: methodConfig?.timeout || serviceConfig?.timeout || this.config.timeout,
        }
    }
}


export {
    type LinkRPCAPIDefineType,
    type LinkRPCDefineConfig,
    type LinkRPCServiceConfig,
    type LinkRPCMethodConfig,
    LinkRPCAPIDefine,
}
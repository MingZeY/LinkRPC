/**
 * 全局解析选项
 */
type SchemaParserOptions = {
    
}

/**
 * 字段解析选项
 */
type SchemaFieldParserOptions = {
    
} & SchemaParserOptions;

/**
 * 解析上下文
 */
type SchemaParseContext = {
    parserOptions:SchemaParserOptions,
    trace:string[]
}

class SchemaParseHandler{

    private options:SchemaParserOptions;
    private currentField?:SchemaField<any>;
    private trace:string[] = [];
    private values:Record<string,any> = {};

    constructor(options?:SchemaParserOptions){
        this.options = options || {};
    }

    setCurrentField(field:SchemaField<any>){
        this.currentField = field;
    }

    pushTrace(id:string){
        this.trace.push(id);
    }

    popTrace(){
        this.trace.pop();
    }

    getTrace(){
        return this.trace;
    }

    setValue(id:string,value:any){
        this.values[id] = value;
    }

    getValueById(id:string):any{
        return this.values[id];
    }

    getValueByField<F extends SchemaField<any>>(field:F):F['infer']{
        const id = field.descriptor.id;
        if(!id){
            throw new Error('field id is undefined');
        }
        return this.values[id];
    }

    getContext():SchemaParseContext{
        return {
            parserOptions:this.options,
            trace:this.trace,
        }
    }
}

/**
 * Schema类型展开
 */
type SchemaPrettyify<T> = T extends Record<any,any> ? {[P in keyof T]:SchemaPrettyify<T[P]>} : T;

type SchemaFieldValidator<T> = (value:T,handler:SchemaParseHandler) => boolean;

/**
 * 字段描述符
 */
type SchemaFieldDescriptor<T> = {
    name?:string | undefined,
    id?:string | undefined,
    optional?:boolean | undefined,
    default?:T | undefined
    infer?:T | undefined,
    typeof?:'bigint'|'boolean'|'function'|'number'|'object'|'string'|'symbol'|'undefined' | undefined,
    parser?:((value:any,handler:SchemaParseHandler) => T) | undefined;
    validators?:{
        [name:string]:{
            validator:SchemaFieldValidator<T>,
            description?:string | undefined,
        }
    };
}

class ParseError extends Error{
    public detail:{
        context:SchemaParseContext
        message?:string | undefined;
        revice?:string | undefined,
        require?:string | undefined,
    };
    constructor(detail:ParseError['detail'],options?:ErrorOptions){
        super(detail.message,options)
        this.detail = detail;
    }
}

class SchemaField<T>{

    public descriptor:SchemaFieldDescriptor<T>;
    public fieldParserOptions?:SchemaFieldParserOptions;

    constructor(descriptor?:SchemaFieldDescriptor<T>){
        this.descriptor = Object.assign({
            name:this.constructor.name,
        },descriptor);
    }

    get infer():T{
        return this.descriptor.infer as T;
    }

    get name(){
        return this.descriptor.name || this.constructor.name;
    }

    public copy(id?:string):this{
        const copyDescriptor:SchemaFieldDescriptor<T> = {
            ...this.descriptor,
            ...(this.descriptor.validators ? {
                validators:{
                    ...this.descriptor.validators
                }
            } : undefined)
        }
        copyDescriptor.id = id;
        // 使用Object.create和Object.assign来保持子类类型
        const copy = Object.create(Object.getPrototypeOf(this));
        Object.assign(copy, this);
        copy.descriptor = copyDescriptor;
        return copy;
    }

    public id(id:string){
        this.descriptor.id = id;
    }

    public parseRecursion(value:any,handler:SchemaParseHandler):SchemaPrettyify<T>{
        if(value === undefined){
            value = this.descriptor.default;
        }

        // setup handler
        handler.setCurrentField(this);

        // setup parser
        let parser = this.descriptor.parser;
        if(!parser && this.descriptor.typeof){
            parser = (v,h) => {
                if(typeof v != this.descriptor.typeof){
                    const c = h.getContext();
                    throw new ParseError({
                        context:c,
                        require:this.name || 'unknow',
                        revice:typeof v
                    })    
                }
                return v;
            }
        }
        if(!parser){
            throw new ParseError({
                context:handler.getContext(),
                message:`Field type ${this.constructor.name} does not support parsing`,
                revice:value,
            })
        }

        // parse value
        if(this.descriptor.optional && value == undefined){
            return value;
        }
        value = parser(value,handler);

        // validate
        if(this.descriptor.validators){
            for(const name in this.descriptor.validators){
                const validatorInfo = this.descriptor.validators[name]!;
                const validator = validatorInfo.validator;
                if(!validator(value,handler)){
                    throw new ParseError({
                        context:handler.getContext(),
                        message:`Validator ${name} failed ${validatorInfo.description ? `: ${validatorInfo.description}` : ''}`,
                        revice:value,
                    })
                }
            }
        }
        if(this.descriptor.id){
            handler.setValue(this.descriptor.id,value);
        }
        return value;
    }

    public parse(value:any,options?:SchemaParserOptions):SchemaPrettyify<T>{
        const defaultParserOptions:SchemaFieldParserOptions = {
            
        }
        const context:SchemaParseContext = {
            parserOptions:options || defaultParserOptions,
            trace:[]
        }
        const handler = new SchemaParseHandler(context);
        return this.parseRecursion(value,handler);
    }

    public parseAsync(value:any,options?:SchemaParserOptions):Promise<SchemaPrettyify<T>>{
        return new Promise((resolve) => {
            resolve(this.parse(value,options));
        })
    }

    public setFieldParserOptions(options:SchemaFieldParserOptions){
        this.fieldParserOptions = options;
        return this
    }

    public default(value:T){
        this.descriptor.default = value;
        return this;
    }

    public optional(){
        this.descriptor.optional = true;
        return this as SchemaField<T | undefined>;
    }

    public setValidator(validator:SchemaFieldValidator<T>,config?:{
        name?:string,
        description?:string,
    }){
        if(!this.descriptor.validators){
            this.descriptor.validators = {}
        }
        const name = config?.name || Object.keys(this.descriptor.validators).length.toString();
        this.descriptor.validators[name] = {
            validator,
            description:config?.description,
        };
        return this;
    }
}

class StringField extends SchemaField<string>{
    constructor(){
        super({
            typeof:'string'
        })
    }
}

class NumberField extends SchemaField<number>{
    constructor(){
        super({
            typeof:'number'
        })
    }

    min(target:number){
        this.setValidator((value) => {
            return value >= target;
        },{
            name:'min',
            description:`Minimum value is ${target}`,
        })
        return this;
    }

    max(target:number){
        this.setValidator((value) => {
            return value <= target;
        },{
            name:'max',
            description:`Maximum value is ${target}`,
        })
        return this;
    }

    between(min:number,max:number){
        if(max < min){
            throw new Error(`max ${max} must be greater than min ${min}`);
        }
        this.min(min);
        this.max(max);
        return this;
    }
};

class BooleanField extends SchemaField<boolean>{
    constructor(){
        super({
            typeof:'boolean'
        })
    }
};

class AnyField extends SchemaField<any>{
    constructor(){
        super({
            parser:(value) => {
                return value;
            }
        })
    }    
}

type RecordFieldInfer<T extends Record<string,SchemaField<any>>> = {[P in keyof T]: T[P]['infer'];}
class RecordField<T extends Record<string,SchemaField<any>>> extends SchemaField<RecordFieldInfer<T>>{
    public record:T;
    constructor(record:T){
        super({
            parser: (value,handler) => {
                if(typeof value == 'string'){
                    value = JSON.parse(value);
                }
                if(typeof value != 'object' || value === null){
                    throw new ParseError({
                        context:handler.getContext(),
                        require:this.descriptor.name,
                        revice:value,
                    })
                }
                // Clone to avoid mutating the original object
                const result:Record<string,any> = {};
                // Filter: only copy keys that exist in the schema
                for(let key in value){
                    if(key in record){
                        result[key] = value[key];
                    }
                }
                // Parse
                for(let key in record){
                    let keyType = record[key]!;
                    let keyValue = result[key];
                    handler.pushTrace(key);
                    result[key] = keyType.parseRecursion(keyValue,handler);
                    handler.popTrace();
                }
                return result as RecordFieldInfer<T>;
            }
        });
        this.record = record;
    }
}

type ArrayFieldInfer<T extends SchemaField<any>> = T extends SchemaField<infer P> ? P[] : never;
class ArrayField<T extends SchemaField<any>> extends SchemaField<ArrayFieldInfer<T>>{
    constructor(type:T){
        super({
            parser:(value,handler) => {
                const originValueType = typeof value;
                if(typeof value == 'string'){
                    value = JSON.parse(value);
                }
                if(!Array.isArray(value)){
                    throw new ParseError({
                        revice:originValueType,
                        require:this.name,
                        context:handler.getContext(),
                    })
                }
                return value.map((i,index) => {
                    handler.pushTrace(index.toString());
                    const v = type.parseRecursion(i,handler);
                    handler.popTrace();
                    return v;
                }) as ArrayFieldInfer<T>
            }
        });
    }
}

type TupleFieldInfer<T extends [SchemaField<any>,...SchemaField<any>[]]> = {[P in keyof T]: T[P]['infer']}
class TupleField<T extends [SchemaField<any>,...SchemaField<any>[]]> extends SchemaField<TupleFieldInfer<T>>{
    constructor(...elements:T){
        super({
            parser: (value,handler) => {
                const valueType = typeof value;
                if(valueType == 'string'){
                    value = JSON.parse(value)
                }
                if(!Array.isArray(value)){
                    throw new ParseError({
                        require:elements.map(i => i.name).join(','),
                        revice:valueType,
                        context:handler.getContext(),
                    })
                }
                if(elements.length != value.length){
                    throw new ParseError({
                        message:`Tuple length must be ${elements.length}`,
                        require:`length:${elements.length}`,
                        revice:`length:${value.length}`,
                        context:handler.getContext(),
                    })
                }
                return value.map((i,index) => {
                    let element = elements[index]!;
                    handler.pushTrace(`${index}:${element.name}`);
                    const v = element.parseRecursion(i,handler);
                    handler.popTrace();
                    return v;
                }) as TupleFieldInfer<T>
            }
        });
    }
}

type FunctionFieldInfer<P extends SchemaField<any>[],R extends SchemaField<any>> = (...args:{[K in keyof P]:P[K]['infer']}) => R['infer'];
class FunctionField<P extends SchemaField<any>[],R extends SchemaField<any>> extends SchemaField<FunctionFieldInfer<P,R>>{
    public _args?:P | undefined;
    public _return?:R | undefined;
    constructor(config?:{
        args?:P | undefined,
        return?:R | undefined,
    }){
        super({
            parser:(value,handler) => {
                throw new ParseError({
                    context:handler.getContext(),
                    message:`Not support parsing function`,
                })
            }
        });
        this._args = config?.args || undefined;
        this._return = config?.return || undefined;
    }

    public args<TP extends SchemaField<any>[]>(...args:TP){
        this._args = args as unknown as P;
        return this as FunctionField<TP,R>;
    }

    public return<TR extends SchemaField<any>>(returnType:TR){
        this._return = returnType as unknown as R;
        return this as FunctionField<P,TR>;
    }
}

type ORFieldInfer<T extends SchemaField<any>[]> = T extends SchemaField<infer P> []? P : never;
class ORField<T extends [SchemaField<any>,...SchemaField<any>[]]> extends SchemaField<ORFieldInfer<T>>{
    constructor(types:T){
        const typesRef = types;
        super({
            parser: (value,handler) => {
                const rawValue = value;
                const errors:ParseError[] = [];
                for(let type of typesRef){
                    try{
                        return type.parseRecursion(value,handler) as ORFieldInfer<T>;
                    }catch(e){
                        if(e instanceof ParseError){
                            errors.push(e);
                        }else{
                            throw e;
                        }
                    }
                }
                throw new ParseError({
                    context:handler.getContext(),
                    require: typesRef.map(t => t.name).join('|'),
                    revice: typeof rawValue,
                    message: errors.map(e => e.message).join('|'),
                });
            }
        });
    }
}

type PromiseFiledInfer<T extends SchemaField<any>> = T extends SchemaField<infer P> ? Promise<P> : never;
class PromiseField<T extends SchemaField<any>> extends SchemaField<PromiseFiledInfer<T>>{
    public promiseType:T;
    constructor(type:T){
        super({
            parser:(value,handler) => {
                return type.parseRecursion(value,handler);
            }
        });
        this.promiseType = type;
    }
}

type EnumFieldInfer<T> = T extends [infer U,...(infer U)[]] ? U : never;
class EnumField<U extends string, T extends [U,...U[]]> extends SchemaField<EnumFieldInfer<T>>{
    public enums:T;
    constructor(enums:T){
        super({
            parser:(value,handler) => {
                if(typeof value != 'string'){
                    throw new ParseError({
                        context:handler.getContext(),
                        require:'string',
                        revice:typeof value,
                        message:`Value ${value} is not a string`,
                    })
                }
                if(!enums.includes(value as EnumFieldInfer<T>)){
                    throw new ParseError({
                        context:handler.getContext(),
                        require:enums.join('|'),
                        revice:value,
                        message:`Value ${value} is not in enum`,
                    })
                }
                return value as EnumFieldInfer<T>;
            }
        });
        this.enums = enums;
    }
}

class SchemaBuilder{

    public string(){
        return new StringField();
    }

    public number(){
        return new NumberField();
    }

    public boolean(){
        return new BooleanField();
    }

    public any(){
        return new AnyField();
    }

    public record<P extends ConstructorParameters<typeof RecordField>[0]>(args:P){
        return new RecordField(args);
    }

    public array<P extends ConstructorParameters<typeof ArrayField>[0]>(args:P){
        return new ArrayField(args);
    }

    public tuple<P extends ConstructorParameters<typeof TupleField>>(...args:P){
        return new TupleField(...args);
    }

    /**
     * alias for tuple
     */
    public args<P extends ConstructorParameters<typeof TupleField>>(...args:P){
        return new TupleField(...args);
    }

    public function<P extends ConstructorParameters<typeof FunctionField>[0]>(args?:P){
        return new FunctionField(args);
    }

    public or<T extends [SchemaField<any>,SchemaField<any>,...SchemaField<any>[]]>(...types:T){
        return new ORField(types);
    }

    public promise<P extends ConstructorParameters<typeof PromiseField>[0]>(args:P){
        return new PromiseField(args);
    }

    public enum<U extends string, T extends [U,...U[]]>(values:T){
        return new EnumField(values);
    }

    public build<T extends SchemaField<any>>(constructor:(builder:this) => T){
        return constructor(this);
    }

}


export{
    SchemaField as LinkRPCSchemaField,
    SchemaBuilder as LinkRPCSchemaBuilder,
    ParseError as LinkRPCSchemaParseError,
}
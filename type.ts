
export interface ApiLink {
    rel: string;
    method?: "get" | "post" | "put" | "delete";
    url: string;
    body?: any[];
    query?: any[];
    name?: string;
    desc?: string;
}

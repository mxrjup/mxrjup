import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
    providedIn: 'root'
})
export class DataService {
    private apiUrl = '/api';

    constructor(private http: HttpClient) { }

    getData<T>(type: string): Observable<T> {
        return this.http.get<T>(`${this.apiUrl}/data/${type}`);
    }
}

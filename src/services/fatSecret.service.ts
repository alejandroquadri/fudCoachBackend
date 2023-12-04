import axios from 'axios';

export class FatSecretService {
  private baseURL = 'https://platform.fatsecret.com/rest/server.api';
  private clientID = process.env.FAT_SECRET_CLIENT_ID;
  private clientSecret = process.env.FAT_SECRET_CLIENT_SECRET;
  private accessToken: string | null = null;

  private async getAccessToken(): Promise<string | null> {
    if (this.accessToken) return this.accessToken;

    const tokenURL = 'https://oauth.fatsecret.com/connect/token';
    const authString = `${this.clientID}:${this.clientSecret}`;
    const encodedAuthString = Buffer.from(authString).toString('base64');

    const response = await axios.post(
      tokenURL,
      'grant_type=client_credentials&scope=basic',
      {
        headers: {
          Authorization: 'Basic ' + encodedAuthString,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );

    this.accessToken = response.data.access_token;
    return this.accessToken;
  }

  public async searchFoods(
    query: string,
    pageNumber = 0,
    maxResults = 10
  ): Promise<any> {
    console.log('me llega esta query', query);
    const accessToken = await this.getAccessToken();
    console.log('got token', accessToken);

    const params = new URLSearchParams();
    params.append('method', 'foods.search');
    params.append('search_expression', 'chips lays original');
    params.append('format', 'json');
    params.append('page_number', String(pageNumber));
    params.append('max_results', String(maxResults));

    const response = await axios.post(this.baseURL, params, {
      headers: {
        Authorization: 'Bearer ' + accessToken,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    return response.data;
  }

  // public async searchFoods(
  //   query: string,
  //   pageNumber = 0,
  //   maxResults = 10
  // ): Promise<any> {
  //   console.log('me llega esta query', query);
  //   const accessToken = await this.getAccessToken();
  //   console.log('got token', accessToken);

  //   const response = await axios.post(
  //     this.baseURL,
  //     {
  //       method: 'foods.search',
  //       search_expression: query,
  //       format: 'json',
  //       page_number: pageNumber,
  //       max_results: maxResults,
  //     },
  //     {
  //       headers: {
  //         Authorization: 'Bearer ' + accessToken,
  //         'Content-Type': 'application/json',
  //       },
  //     }
  //   );

  //   return response.data;
  // }

  // public async searchFoodsV(
  //   query: string,
  //   pageNumber = 0,
  //   maxResults = 20
  // ): Promise<any> {
  //   console.log('me llega esta query', query);
  //   const accessToken = await this.getAccessToken();
  //   console.log('got token');
  //   const response = await axios.get(this.baseURL + 'foods.search', {
  //     headers: {
  //       Authorization: 'Bearer ' + accessToken,
  //     },
  //     params: {
  //       search_expression: query,
  //       page_number: pageNumber,
  //       max_results: maxResults,
  //       format: 'json',
  //     },
  //   });

  //   return response.data;
  // }
}

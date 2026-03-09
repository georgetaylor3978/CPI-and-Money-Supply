import axios from 'axios';
axios.get('https://www.bankofcanada.ca/valet/observations/CPI_TRIM,CPI_MEDIAN,CPI_COMMON,V37151,V37152,V41552801,V41690973/json?recent=15').then(res => {
    import('fs').then(fs => fs.writeFileSync('sample.json', JSON.stringify(res.data, null, 2)));
});

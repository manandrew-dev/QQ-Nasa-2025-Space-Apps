import {useState, useEffect} from 'react';
import '../styles/index.css';
import MapIcon from '@mui/icons-material/Map';

function SearchReturnPage() {

    interface LocationTimeData {
        lat: number;
        lng: number;

    }

  const [data, setData] = useState<LocationTimeData>({
    location: 'Victoria',
    time: '18:30'
    });  

  useEffect(() => {
    fetch('https://your-api.com/location-time')
      .then(res => res.json())
      .then(jsonData => setData(jsonData))
      .catch(error => console.error('Error:', error));
  }, []);

  return (
    <div className="min-h-screen flex flex-col py-8 px-4 " style={{ background: '#F1FAEE' }}>

        {/* top tile */}
        <div className='grid grid-cols-3 p-1 my-1 text-[#1D3557] h-[10vh]' style={{ background: '#A8DADC', borderRadius:'25px' }}>
            <div className='flex items-center justify-left gap-2'>
                <MapIcon className='w-10 h-10' />
                <h1 className='text-lg font-medium'>
                    {data.location} • {data.time}
                </h1>
            </div>
            <div className=''>
                Looks good to do this!
            </div>
            <div className=''>
                Search again bar
            </div>
        </div>

        {/* middle 3 return grids */}
        <div className='grid grid-cols-4 text-center my-3 h-[25vh]'>
            <div className='m-4 h-full' style={{ background: '#A8DADC', borderRadius:'25px' }}>
                Temperature 
            </div>
            <div className='m-4 h-full' style={{ background: '#A8DADC', borderRadius:'25px' }}>
                Weather 
            </div>
            <div className='m-4 h-full' style={{ background: '#A8DADC', borderRadius:'25px' }}>
                Conditions, windspeed/ground 
            </div>
            <div className='m-4 h-full' style={{ background: '#A8DADC', borderRadius:'25px' }}>
                also conditions, things like uv index  
            </div>
        </div>

    </div>
  );
}

export default SearchReturnPage;

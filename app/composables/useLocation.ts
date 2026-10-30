export interface Country {
  id: string
  name: string
  iso_code: string
  is_system?: boolean
}

export interface City {
  id: string
  name: string
  country_id: string
  is_system?: boolean
  created_at?: string
}

export interface Neighborhood {
  id: string
  name: string
  city_id: string
  created_at?: string
}

export function useLocation() {
  const { apiFetch } = useApi()

  function fetchCountries() {
    return apiFetch<Country[]>('/location/countries')
  }

  function fetchCities(countryId?: string) {
    return apiFetch<City[]>('/location/cities', { query: countryId ? { country_id: countryId } : {} })
  }

  function fetchNeighborhoods(cityId?: string) {
    return apiFetch<Neighborhood[]>('/location/neighborhoods', { query: cityId ? { city_id: cityId } : {} })
  }

  function createCity(name: string, countryId: string) {
    return apiFetch<City>('/location/cities', { method: 'POST', body: { name, country_id: countryId } })
  }

  function createNeighborhood(name: string, cityId: string) {
    return apiFetch<Neighborhood>('/location/neighborhoods', { method: 'POST', body: { name, city_id: cityId } })
  }

  function deleteNeighborhood(id: string) {
    return apiFetch(`/location/neighborhoods/${id}`, { method: 'DELETE' })
  }

  return { fetchCountries, fetchCities, fetchNeighborhoods, createCity, createNeighborhood, deleteNeighborhood }
}

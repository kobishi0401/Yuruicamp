package com.yuruicamp.backend.catalog.application;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.util.List;

import com.yuruicamp.backend.catalog.api.BrandResponse;
import com.yuruicamp.backend.catalog.domain.Brand;
import com.yuruicamp.backend.catalog.infrastructure.BrandRepository;

import org.junit.jupiter.api.Test;

class BrandCatalogServiceTest {

	@Test
	void listBrandsKeepsRepositoryOrderAndPublicFields() {
		BrandRepository repository = mock(BrandRepository.class);
		Brand first = brand("coleman", "Coleman", "/assets/brands/coleman.svg");
		Brand second = brand("logos", "LOGOS", null);
		when(repository.findAllByOrderBySortOrderAscIdAsc())
				.thenReturn(List.of(first, second));

		BrandCatalogService service = new BrandCatalogService(repository);

		assertEquals(
				List.of(
						new BrandResponse("coleman", "Coleman", "/assets/brands/coleman.svg"),
						new BrandResponse("logos", "LOGOS", null)),
				service.listBrands());
	}

	private Brand brand(String id, String name, String logoUrl) {
		Brand brand = mock(Brand.class);
		when(brand.getId()).thenReturn(id);
		when(brand.getName()).thenReturn(name);
		when(brand.getLogoUrl()).thenReturn(logoUrl);

		return brand;
	}
}

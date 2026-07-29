package com.yuruicamp.backend.logistics.domain;

import java.util.Collections;
import java.util.HashMap;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import com.yuruicamp.backend.common.exception.BusinessException;
import com.yuruicamp.backend.common.exception.ErrorCode;

/**
 * 台灣縣市＋行政區 → 3 碼郵遞區號（對齊 storefront {@code tw-district-zip.js}）。
 * 出貨前驗證 snapshot 郵遞區號與行政區一致，避免綠界 TCAT 10500057。
 */
public final class EcpayTaiwanDistrictZip {

	private static final Pattern CITY_DISTRICT = Pattern.compile(
			"^((?:臺|台)[^\\s]+市|[^\\s]+縣)\\s+([^\\s]+(?:區|鄉|鎮|市))");

	private static final Map<String, Map<String, String>> LOOKUP = buildLookup();

	private EcpayTaiwanDistrictZip() {
	}

	public record CityDistrict(String city, String district) {
	}

	public static void validateZipMatchesDistrict(String zipCode, String streetAddress) {
		parseCityDistrict(streetAddress).ifPresent(cityDistrict -> {
			String expected = lookup(cityDistrict.city(), cityDistrict.district());
			if (expected == null) {
				return;
			}
			String actual = normalizeZip(zipCode);
			if (!expected.equals(actual)) {
				throw new BusinessException(ErrorCode.CONFLICT,
						"Postal code " + zipCode + " does not match "
								+ cityDistrict.district() + " (expected " + expected + ")");
			}
		});
	}

	public static String lookup(String city, String district) {
		Map<String, String> districts = LOOKUP.get(normalizeCityKey(city));
		if (districts == null) {
			return null;
		}
		return districts.get(String.valueOf(district).trim());
	}

	static java.util.Optional<CityDistrict> parseCityDistrict(String streetAddress) {
		if (streetAddress == null || streetAddress.isBlank()) {
			return java.util.Optional.empty();
		}
		Matcher matcher = CITY_DISTRICT.matcher(streetAddress.trim());
		if (!matcher.find()) {
			return java.util.Optional.empty();
		}
		return java.util.Optional.of(new CityDistrict(matcher.group(1).trim(), matcher.group(2).trim()));
	}

	private static String normalizeCityKey(String city) {
		return String.valueOf(city).trim().replace('台', '臺');
	}

	private static String normalizeZip(String zipCode) {
		String value = String.valueOf(zipCode).trim();
		if (value.matches("\\d{5}")) {
			return value.substring(0, 3);
		}
		return value;
	}

	private static Map<String, Map<String, String>> buildLookup() {
		Map<String, Map<String, String>> lookup = new HashMap<>();
		putCity(lookup, "臺北市", map(
				"中正區", "100", "大同區", "103", "中山區", "104", "松山區", "105", "大安區", "106",
				"萬華區", "108", "信義區", "110", "士林區", "111", "北投區", "112", "內湖區", "114",
				"南港區", "115", "文山區", "116"));
		putCity(lookup, "新北市", map(
				"板橋區", "220", "三重區", "241", "中和區", "235", "永和區", "234", "新莊區", "242",
				"新店區", "231", "樹林區", "238", "鶯歌區", "239", "三峽區", "237", "淡水區", "251",
				"汐止區", "221", "瑞芳區", "224"));
		putCity(lookup, "桃園市", map(
				"桃園區", "330", "中壢區", "320", "平鎮區", "324", "八德區", "334", "楊梅區", "326",
				"蘆竹區", "338", "大溪區", "335", "龍潭區", "325", "龜山區", "333", "大園區", "337",
				"觀音區", "328", "新屋區", "327", "復興區", "336"));
		putCity(lookup, "臺中市", map(
				"中區", "400", "東區", "401", "南區", "402", "西區", "403", "北區", "404",
				"西屯區", "407", "南屯區", "408", "北屯區", "406", "豐原區", "420", "東勢區", "423",
				"大甲區", "437", "清水區", "436", "沙鹿區", "433", "梧棲區", "435", "后里區", "421",
				"神岡區", "429", "潭子區", "427", "大雅區", "428", "大肚區", "432", "龍井區", "434",
				"霧峰區", "413", "太平區", "411", "烏日區", "414", "新社區", "426", "石岡區", "422",
				"外埔區", "438", "大安區", "439", "和平區", "424"));
		putCity(lookup, "臺南市", map(
				"中西區", "700", "東區", "701", "南區", "702", "北區", "704", "安平區", "708",
				"安南區", "709", "永康區", "710", "歸仁區", "711", "新化區", "712", "善化區", "741",
				"新市區", "744", "安定區", "745"));
		putCity(lookup, "高雄市", map(
				"新興區", "800", "前金區", "801", "苓雅區", "802", "鹽埕區", "803", "鼓山區", "804",
				"旗津區", "805", "前鎮區", "806", "三民區", "807", "左營區", "813", "楠梓區", "811",
				"小港區", "812", "鳳山區", "830"));
		putCity(lookup, "基隆市", map(
				"仁愛區", "200", "信義區", "201", "中正區", "202", "中山區", "203", "安樂區", "204",
				"暖暖區", "205", "七堵區", "206"));
		putCity(lookup, "新竹市", map("東區", "300", "北區", "300", "香山區", "300"));
		putCity(lookup, "新竹縣", map(
				"竹北市", "302", "竹東鎮", "310", "新埔鎮", "305", "關西鎮", "306", "湖口鄉", "303",
				"芎林鄉", "307"));
		putCity(lookup, "苗栗縣", map(
				"苗栗市", "360", "頭份市", "351", "竹南鎮", "350", "後龍鎮", "356", "通霄鎮", "357",
				"苑裡鎮", "358"));
		putCity(lookup, "彰化縣", map(
				"彰化市", "500", "員林市", "510", "和美鎮", "508", "鹿港鎮", "505", "溪湖鎮", "514",
				"二林鎮", "526"));
		putCity(lookup, "南投縣", map(
				"南投市", "540", "埔里鎮", "545", "草屯鎮", "542", "竹山鎮", "557", "集集鎮", "552",
				"名間鄉", "551"));
		putCity(lookup, "雲林縣", map(
				"斗六市", "640", "斗南鎮", "630", "虎尾鎮", "632", "西螺鎮", "648", "土庫鎮", "633",
				"北港鎮", "651"));
		putCity(lookup, "嘉義市", map("東區", "600", "西區", "600"));
		putCity(lookup, "嘉義縣", map(
				"太保市", "612", "朴子市", "613", "布袋鎮", "625", "大林鎮", "622", "民雄鄉", "621",
				"水上鄉", "608"));
		putCity(lookup, "屏東縣", map(
				"屏東市", "900", "潮州鎮", "920", "東港鎮", "928", "恆春鎮", "946", "內埔鄉", "912",
				"萬丹鄉", "913"));
		putCity(lookup, "宜蘭縣", map(
				"宜蘭市", "260", "羅東鎮", "265", "蘇澳鎮", "270", "頭城鎮", "261", "礁溪鄉", "262",
				"冬山鄉", "269"));
		putCity(lookup, "花蓮縣", map(
				"花蓮市", "970", "玉里鎮", "981", "新城鄉", "971", "吉安鄉", "973", "壽豐鄉", "974",
				"鳳林鎮", "975"));
		putCity(lookup, "臺東縣", map(
				"臺東市", "950", "成功鎮", "961", "關山鎮", "956", "卑南鄉", "954", "鹿野鄉", "955",
				"池上鄉", "958"));
		putCity(lookup, "澎湖縣", map(
				"馬公市", "880", "湖西鄉", "885", "白沙鄉", "884", "西嶼鄉", "881", "望安鄉", "882",
				"七美鄉", "883"));
		putCity(lookup, "金門縣", map(
				"金城鎮", "893", "金湖鎮", "891", "金沙鎮", "890", "金寧鄉", "892", "烈嶼鄉", "894",
				"烏坵鄉", "896"));
		putCity(lookup, "連江縣", map(
				"南竿鄉", "209", "北竿鄉", "210", "莒光鄉", "212", "東引鄉", "211"));
		return Collections.unmodifiableMap(lookup);
	}

	private static void putCity(Map<String, Map<String, String>> lookup, String city, Map<String, String> districts) {
		lookup.put(city, Collections.unmodifiableMap(districts));
	}

	private static Map<String, String> map(String... pairs) {
		Map<String, String> districts = new HashMap<>();
		for (int i = 0; i < pairs.length; i += 2) {
			districts.put(pairs[i], pairs[i + 1]);
		}
		return districts;
	}
}

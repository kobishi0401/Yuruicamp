package com.yuruicamp.backend.logistics.domain;

import com.yuruicamp.backend.common.exception.BusinessException;
import com.yuruicamp.backend.common.exception.ErrorCode;

/**
 * 將訂單 {@code shipping_address_snapshot} 正規化為綠界 TCAT 建單出站格式。
 * Source: developers.ecpay.com.tw/7414.md — ReceiverAddress 需完整可判斷、範例為緊湊無空格地址。
 */
public final class EcpayTcatAddressFormatter {

	private static final int MIN_RECEIVER_ADDRESS_LENGTH = 7;
	private static final int MAX_RECEIVER_ADDRESS_LENGTH = 60;

	private EcpayTcatAddressFormatter() {
	}

	public record TcatReceiverAddress(String zipCode, String receiverAddress) {
	}

	public static TcatReceiverAddress format(String rawSnapshot) {
		EcpayHomeAddressParser.ParsedAddress parsed = EcpayHomeAddressParser.parse(rawSnapshot);
		if (parsed.zipCode().isBlank() || parsed.streetAddress().isBlank()) {
			throw new BusinessException(ErrorCode.CONFLICT,
					"Shipping address must include postal code and street address for home delivery");
		}
		EcpayTaiwanDistrictZip.validateZipMatchesDistrict(parsed.zipCode(), parsed.streetAddress());
		String receiverAddress = compactAddress(parsed.streetAddress());
		if (receiverAddress.length() < MIN_RECEIVER_ADDRESS_LENGTH
				|| receiverAddress.length() > MAX_RECEIVER_ADDRESS_LENGTH) {
			throw new BusinessException(ErrorCode.CONFLICT,
					"Receiver address length is invalid for TCAT home delivery");
		}
		return new TcatReceiverAddress(parsed.zipCode(), receiverAddress);
	}

	/** 去除空白並將「臺」轉為「台」，供 ReceiverAddress / SenderAddress 出站。 */
	public static String compactAddress(String raw) {
		if (raw == null || raw.isBlank()) {
			return "";
		}
		String noSpaces = raw.trim().replaceAll("\\s+", "");
		return noSpaces.replace('臺', '台');
	}
}

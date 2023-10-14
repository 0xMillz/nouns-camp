import React from "react";
import { css } from "@emotion/react";
import { useWallet } from "@shades/common/wallet";
import { useSwitchNetwork } from "wagmi";
import useFarcasterAccount from "./farcaster-account";
import { useNavigate } from "react-router-dom";
import Avatar from "@shades/ui-web/avatar";
import AccountPreviewPopoverTrigger from "./account-preview-popover-trigger";
import Button from "@shades/ui-web/button";
import { Small } from "./text";
import { useLatestCallback } from "@shades/common/react";
import { setUserData, useUserData as useHubUserData } from "../hooks/hub";
import useSigner from "./signer";
import { signTypedData } from "@wagmi/core";
import { DEFAULT_CHAIN_ID } from "../hooks/farcord";
import { addDays } from "date-fns";
import FormattedDate from "./formatted-date";
import Input from "@shades/ui-web/input";
import { PlusCircle as PlusCircleIcon } from "@shades/ui-web/icons";

const FARCASTER_FNAME_API_ENDPOINT = "https://fnames.farcaster.xyz";

const EIP_712_USERNAME_DOMAIN = {
  name: "Farcaster name verification",
  version: "1",
  chainId: 1,
  verifyingContract: "0xe3be01d99baa8db9905b33a3ca391238234b79d1",
};

export const EIP_712_USERNAME_PROOF = [
  { name: "name", type: "string" },
  { name: "timestamp", type: "uint256" },
  { name: "owner", type: "address" },
];

const AccountPreview = () => {
  const { fid } = useFarcasterAccount();
  const { signer } = useSigner();
  const userData = useHubUserData(fid);
  const [imageUploadError, setImageUploadError] = React.useState(null);

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    let formData = new FormData();
    formData.append("image", file);

    await fetch("https://api.imgur.com/3/image/", {
      method: "POST",
      body: formData,
      headers: {
        Authorization: "Client-ID " + process.env.IMGUR_CLIENT_ID,
        Accept: "application/json",
      },
    })
      .then((res) => res.json())
      .then(async (data) => {
        if (!data.success) {
          throw new Error("Image upload failed: " + data.data.error);
        }

        return await setUserData({
          fid,
          signer,
          dataType: "pfp",
          value: data.data.link,
        }).then(() => {
          // todo: not sure how to do this better...
          window.location.reload();
        });
      })
      .catch((err) => {
        console.error(err);
        setImageUploadError(err);
      });
  };

  return (
    <>
      <div
        css={css({
          display: "grid",
          gridTemplateColumns: "5rem auto",
          columnGap: "1rem",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: "2.4rem",
          maxWidth: "40rem",
          justifySelf: "center",
        })}
      >
        <div
          css={(t) =>
            css({
              background: t.colors.borderLighter,
              width: "5rem",
              height: "5rem",
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            })
          }
        >
          <label htmlFor="file-input">
            {userData?.pfp ? (
              <Avatar
                url={userData?.pfp}
                size="5rem"
                css={(t) =>
                  css({
                    background: t.colors.borderLighter,
                  })
                }
              />
            ) : (
              <PlusCircleIcon height="auto" />
            )}
          </label>

          <input
            id="file-input"
            type="file"
            onChange={handleFileUpload}
            style={{ display: "none" }}
          />
        </div>

        <div
          css={() =>
            css({
              textAlign: "left",
            })
          }
        >
          <p>
            <span style={{ fontWeight: "bold" }}>{userData?.displayName}</span>{" "}
            <AccountPreviewPopoverTrigger
              fid={fid}
              css={(t) => css({ color: t.colors.textMuted })}
            />
          </p>
          <p>{userData?.bio}</p>
        </div>
      </div>
      {imageUploadError && (
        <Small
          css={(t) =>
            css({
              marginTop: "0.5rem",
              color: t.colors.textDanger,
              textOverflow: "clip",
            })
          }
        >
          {imageUploadError.message}
        </Small>
      )}
    </>
  );
};

const ProfileView = () => {
  const navigate = useNavigate();
  const { accountAddress, switchToEthereumMainnet, chain } = useWallet();

  const { switchNetworkAsync: switchNetwork } = useSwitchNetwork();
  const switchToOptimismMainnet = () => switchNetwork(DEFAULT_CHAIN_ID);

  const { fid } = useFarcasterAccount();
  const { signer } = useSigner();

  const userData = useHubUserData(fid);

  const [hasUsernameUpdatePending, setHasUsernameUpdatePending] =
    React.useState(false);
  const [usernameUpdateError, setUsernameUpdateError] = React.useState(null);
  const [usernameUpdateValue, setUsernameUpdateValue] = React.useState(null);
  const [isValidUsername, setIsValidUsername] = React.useState(
    Boolean(usernameUpdateValue)
  );
  const [usernameTimelock, setUsernameTimelock] = React.useState(null);

  const [displayNameUpdateValue, setDisplayNameUpdateValue] = React.useState(
    userData?.displayName
  );
  const [displayNameUpdatePending, setDisplayNameUpdatePending] =
    React.useState(false);
  const [displayNameUpdateError, setDisplayNameUpdateError] =
    React.useState(null);

  const [bioUpdateValue, setBioUpdateValue] = React.useState(null);
  const [bioUpdatePending, setBioUpdatePending] = React.useState(false);
  const [bioUpdateError, setBioUpdateError] = React.useState(null);

  const checkUsernameAvailability = useLatestCallback(async () => {
    if (!usernameUpdateValue) return;
    const response = await fetch(
      FARCASTER_FNAME_API_ENDPOINT + `/transfers?name=${usernameUpdateValue}`
    );
    const data = await response.json();
    const transfers = data?.transfers || [];

    return !(transfers.length >= 1);
  }, [usernameUpdateValue]);

  const registerUsernameChange = async () => {
    if (!usernameUpdateValue) return;
    const isAvailable = await checkUsernameAvailability();

    if (!isAvailable) {
      setUsernameUpdateError("Username is already taken");
      return;
    }

    const proofTimestamp = Math.floor(Date.now() / 1000);
    const usernameProofClaim = {
      owner: accountAddress,
      name: usernameUpdateValue,
      timestamp: BigInt(proofTimestamp),
    };

    try {
      await switchToEthereumMainnet();
      const signature = await signTypedData({
        domain: EIP_712_USERNAME_DOMAIN,
        types: { UserNameProof: EIP_712_USERNAME_PROOF },
        primaryType: "UserNameProof",
        message: usernameProofClaim,
      });

      const response = await fetch(
        FARCASTER_FNAME_API_ENDPOINT + "/transfers",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: usernameUpdateValue,
            from: 0,
            to: Number(fid),
            fid: Number(fid),
            owner: accountAddress,
            timestamp: proofTimestamp,
            signature: signature,
          }),
        }
      );

      const data = await response.json();

      if (data?.error) {
        setUsernameUpdateError(data.error);
        return;
      }
    } catch (e) {
      console.error(e);
      setUsernameUpdateError(e.message);
    } finally {
      switchToOptimismMainnet();
    }
  };

  const handleDisplayNameSubmit = async (e) => {
    e.preventDefault();
    setDisplayNameUpdatePending(true);
    setDisplayNameUpdateError(null);

    return await setUserData({
      fid,
      signer,
      dataType: "displayName",
      value: displayNameUpdateValue,
    }).then(() => {
      setDisplayNameUpdatePending(false);
      setDisplayNameUpdateError(null);
    });
  };

  const handleBioSubmit = async (e) => {
    e.preventDefault();
    setBioUpdatePending(true);
    setBioUpdateError(null);

    return await setUserData({
      fid,
      signer,
      dataType: "bio",
      value: bioUpdateValue,
    }).then(() => {
      setBioUpdatePending(false);
      setBioUpdateError(null);
    });
  };

  React.useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      setUsernameUpdateError(null);
      checkUsernameAvailability().then((isAvailable) => {
        if (!usernameUpdateValue) return;
        if (!isAvailable) {
          setIsValidUsername(false);
          setUsernameUpdateError("Username is already taken");
        } else {
          setIsValidUsername(true);
        }
      });
    }, 500);

    return () => clearTimeout(delayDebounceFn);
  }, [usernameUpdateValue, checkUsernameAvailability]);

  React.useEffect(() => {
    const fetchTransfers = async (fid) => {
      const response = await fetch(
        FARCASTER_FNAME_API_ENDPOINT + `/transfers?fid=${fid}`
      );
      const data = await response.json();
      const transfer = data?.transfers?.[0];
      if (!transfer) return;

      const { timestamp } = transfer;
      const timelockDate = addDays(new Date(timestamp * 1000), 28);
      const pastTimelock = timelockDate < new Date();

      if (!pastTimelock) {
        setUsernameTimelock(timelockDate);
      }
    };

    fetchTransfers(fid);
  }, [fid]);

  React.useEffect(() => {
    if (!userData) return;

    setDisplayNameUpdateValue(userData?.displayName);
    setBioUpdateValue(userData?.bio);
  }, [userData]);

  if (chain?.unsupported) {
    return (
      <div
        css={(t) =>
          css({
            position: "relative",
            zIndex: 0,
            flex: 1,
            minWidth: "min(30.6rem, 100vw)",
            background: t.colors.backgroundPrimary,
            display: "flex",
            flexDirection: "column",
            height: "100%",
            overflow: "auto",
            alignItems: "center",
          })
        }
      >
        <div
          css={css({
            display: "grid",
            gridTemplateRows: "auto",
            alignItems: "center",
            justifyContent: "center",
            alignContent: "center",
            textAlign: "center",
            rowGap: "2rem",
            minHeight: "100vh",
            padding: "0 1rem",
          })}
        >
          <div style={{ color: "#ffc874" }}>Network not supported</div>
          <Button
            size="larger"
            onClick={() => {
              switchToOptimismMainnet().then(
                () => {},
                (e) => {
                  // wallet_switchEthereumChain already pending
                  if (e.code === 4902) return;
                }
              );
            }}
          >
            Switch to Optimism
          </Button>
        </div>
      </div>
    );
  }

  if (!fid) {
    return (
      <div
        css={(t) =>
          css({
            position: "relative",
            zIndex: 0,
            flex: 1,
            minWidth: "min(30.6rem, 100vw)",
            background: t.colors.backgroundPrimary,
            display: "flex",
            flexDirection: "column",
            height: "100%",
            overflow: "auto",
            alignItems: "center",
          })
        }
      >
        <div
          css={css({
            display: "grid",
            gridTemplateRows: "auto",
            alignItems: "center",
            justifyContent: "center",
            alignContent: "center",
            textAlign: "center",
            rowGap: "2rem",
            minHeight: "100vh",
            padding: "0 1rem",
          })}
        >
          <p>No farcaster account found in this wallet.</p>
          <Button onClick={() => navigate("/register")} size="medium">
            Create new account
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      css={(t) =>
        css({
          position: "relative",
          zIndex: 0,
          flex: 1,
          minWidth: "min(30.6rem, 100vw)",
          background: t.colors.backgroundPrimary,
          display: "flex",
          flexDirection: "column",
          height: "100%",
          overflow: "auto",
          alignItems: "center",
        })
      }
    >
      <div
        css={css({
          display: "grid",
          gridTemplateRows: "auto",
          alignItems: "center",
          justifyContent: "center",
          alignContent: "center",
          textAlign: "center",
          rowGap: "2rem",
          minHeight: "100vh",
          padding: "0 1rem",
        })}
      >
        <AccountPreview />

        <div>
          <form
            id="update-displayName-form"
            onSubmit={handleDisplayNameSubmit}
            css={css({
              flex: 1,
              minHeight: 0,
              display: "flex",
              flexDirection: "column",
            })}
          >
            <input
              value={displayNameUpdateValue ?? ""}
              onChange={(e) => setDisplayNameUpdateValue(e.target.value)}
              placeholder={displayNameUpdateValue ?? userData?.displayName}
              css={(t) =>
                css({
                  padding: "1rem",
                  borderRadius: "0.3rem",
                  border: `1px solid ${t.colors.backgroundQuarternary}`,
                  background: "none",
                  fontSize: t.text.sizes.large,
                  width: "100%",
                  outline: "none",
                  fontWeight: t.text.weights.header,
                  margin: "1rem 0",
                  color: t.colors.textNormal,
                  "::placeholder": { color: t.colors.textMuted },
                })
              }
            />

            <Button
              type="submit"
              form="update-displayName-form"
              size="medium"
              isLoading={displayNameUpdatePending}
              disabled={
                displayNameUpdatePending ||
                userData?.displayName == displayNameUpdateValue
              }
            >
              Update display name
            </Button>

            {displayNameUpdateError && (
              <Small
                css={(t) =>
                  css({
                    marginTop: "0.5rem",
                    color: t.colors.textDanger,
                    textOverflow: "clip",
                  })
                }
              >
                {displayNameUpdateError}
              </Small>
            )}
          </form>
        </div>

        <div>
          <form
            id="update-bio-form"
            onSubmit={handleBioSubmit}
            css={css({
              flex: 1,
              minHeight: 0,
              display: "flex",
              flexDirection: "column",
            })}
          >
            <Input
              multiline
              rows={3}
              value={bioUpdateValue ?? ""}
              type="text"
              onChange={(e) => setBioUpdateValue(e.target.value)}
              placeholder={bioUpdateValue ?? userData?.bio}
              css={(t) =>
                css({
                  padding: "1rem",
                  borderRadius: "0.3rem",
                  border: `1px solid ${t.colors.backgroundQuarternary}`,
                  background: "none",
                  //   fontSize: t.text.sizes.large,
                  width: "100%",
                  outline: "none",
                  fontWeight: t.text.weights.header,
                  margin: "1rem 0",
                  color: t.colors.textNormal,
                  "::placeholder": { color: t.colors.textMuted },
                })
              }
            />

            <Button
              type="submit"
              form="update-bio-form"
              size="medium"
              isLoading={bioUpdatePending}
              disabled={bioUpdatePending || userData?.bio == bioUpdateValue}
            >
              Update bio
            </Button>

            {bioUpdateError && (
              <Small
                css={(t) =>
                  css({
                    marginTop: "0.5rem",
                    color: t.colors.textDanger,
                    textOverflow: "clip",
                  })
                }
              >
                {bioUpdateError}
              </Small>
            )}
          </form>
        </div>

        <div
          css={(t) =>
            css({
              marginTop: "5rem",
              borderTop: `1px solid ${t.colors.borderLighter}`,
              paddingTop: "5rem",
            })
          }
        >
          <form
            id="create-username-update-form"
            onSubmit={async (e) => {
              e.preventDefault();
              setHasUsernameUpdatePending(true);
              setUsernameUpdateError(null);
              await registerUsernameChange().finally(() =>
                setHasUsernameUpdatePending(false)
              );
            }}
            css={css({
              flex: 1,
              minHeight: 0,
              display: "flex",
              flexDirection: "column",
            })}
          >
            <h2>Set username</h2>
            <Small>
              https://docs.farcaster.xyz/protocol/fnames.html#fname-policy
            </Small>
            <input
              value={usernameUpdateValue ?? ""}
              onChange={(e) => setUsernameUpdateValue(e.target.value)}
              placeholder="vitalik"
              css={(t) =>
                css({
                  padding: "1rem",
                  borderRadius: "0.3rem",
                  border: `1px solid ${t.colors.backgroundQuarternary}`,
                  background: "none",
                  fontSize: t.text.sizes.large,
                  width: "100%",
                  outline: "none",
                  fontWeight: t.text.weights.header,
                  margin: "1rem 0",
                  color: t.colors.textNormal,
                  "::placeholder": { color: t.colors.textMuted },
                })
              }
            />

            <Button
              type="submit"
              form="create-username-update-form"
              size="medium"
              isLoading={hasUsernameUpdatePending}
              disabled={
                !isValidUsername || hasUsernameUpdatePending || usernameTimelock
              }
            >
              Set username
            </Button>
            {usernameTimelock ? (
              <Small
                css={(t) =>
                  css({
                    marginTop: "1rem",
                    color: usernameUpdateValue
                      ? t.colors.textHighlight
                      : t.colors.textDimmed,
                  })
                }
              >
                You can only change your username again on{" "}
                <FormattedDate
                  value={usernameTimelock}
                  month="short"
                  day="numeric"
                  hour="numeric"
                  minute="numeric"
                />
                .
              </Small>
            ) : (
              <Small style={{ marginTop: "1rem" }}>
                You can only change your username once every 28 days.
              </Small>
            )}

            {usernameUpdateError && (
              <Small
                css={(t) =>
                  css({
                    marginTop: "0.5rem",
                    color: t.colors.textDanger,
                    textOverflow: "clip",
                  })
                }
              >
                {usernameUpdateError}
              </Small>
            )}
          </form>
        </div>
      </div>
    </div>
  );
};

export default ProfileView;
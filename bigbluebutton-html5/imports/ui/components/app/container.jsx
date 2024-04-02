import React, { useEffect, useRef, useState } from 'react';
import { withTracker } from 'meteor/react-meteor-data';
import Auth from '/imports/ui/services/auth';
import Users from '/imports/api/users';
import Meetings, { LayoutMeetings } from '/imports/api/meetings';
import AudioCaptionsLiveContainer from '/imports/ui/components/audio/audio-graphql/audio-captions/live/component';
import AudioCaptionsService from '/imports/ui/components/audio/captions/service';
import { notify } from '/imports/ui/services/notification';
import CaptionsContainer from '/imports/ui/components/captions/live/container';
import CaptionsService from '/imports/ui/components/captions/service';
import getFromUserSettings from '/imports/ui/services/users-settings';
import deviceInfo from '/imports/utils/deviceInfo';
import UserInfos from '/imports/api/users-infos';
import Settings from '/imports/ui/services/settings';
import MediaService from '/imports/ui/components/media/service';
import { isPresentationEnabled, isExternalVideoEnabled } from '/imports/ui/services/features';
import {
  layoutSelect,
  layoutSelectInput,
  layoutSelectOutput,
  layoutDispatch,
} from '../layout/context';
import { isEqual } from 'radash';
import useCurrentUser from '/imports/ui/core/hooks/useCurrentUser';
import useMeeting from '/imports/ui/core/hooks/useMeeting';
import { LAYOUT_TYPE } from '/imports/ui/components/layout/enums';
import { useMutation } from '@apollo/client';
import { SET_MOBILE_FLAG } from '/imports/ui/core/graphql/mutations/userMutations';
import { SET_SYNC_WITH_PRESENTER_LAYOUT, SET_LAYOUT_PROPS } from './mutations';

import {
  getFontSize,
  getBreakoutRooms,
} from './service';

import App from './component';
import useToggleVoice from '../audio/audio-graphql/hooks/useToggleVoice';
import useUserChangedLocalSettings from '../../services/settings/hooks/useUserChangedLocalSettings';

const CUSTOM_STYLE_URL = window.meetingClientSettings.public.app.customStyleUrl;

const endMeeting = (code, ejectedReason) => {
  Session.set('codeError', code);
  Session.set('errorMessageDescription', ejectedReason);
  Session.set('isMeetingEnded', true);
};

const AppContainer = (props) => {
  function usePrevious(value) {
    const ref = useRef();
    useEffect(() => {
      ref.current = value;
    });
    return ref.current;
  }

  const layoutType = useRef(null);

  const {
    actionsbar,
    selectedLayout,
    pushLayout,
    pushLayoutMeeting,
    currentUserId,
    shouldShowScreenshare: propsShouldShowScreenshare,
    shouldShowSharedNotes,
    presentationRestoreOnUpdate,
    isModalOpen,
    meetingLayout,
    meetingLayoutUpdatedAt,
    meetingPresentationIsOpen,
    isMeetingLayoutResizing,
    meetingLayoutCameraPosition,
    meetingLayoutFocusedCamera,
    meetingLayoutVideoRate,
    isSharedNotesPinned,
    viewScreenshare,
    ...otherProps
  } = props;

  const sidebarContent = layoutSelectInput((i) => i.sidebarContent);
  const genericComponent = layoutSelectInput((i) => i.genericComponent);
  const sidebarNavigation = layoutSelectInput((i) => i.sidebarNavigation);
  const actionsBarStyle = layoutSelectOutput((i) => i.actionBar);
  const captionsStyle = layoutSelectOutput((i) => i.captions);
  const cameraDock = layoutSelectOutput((i) => i.cameraDock);
  const cameraDockInput = layoutSelectInput((i) => i.cameraDock);
  const presentation = layoutSelectInput((i) => i.presentation);
  const deviceType = layoutSelect((i) => i.deviceType);
  const layoutContextDispatch = layoutDispatch();

  const [setMobileFlag] = useMutation(SET_MOBILE_FLAG);
  const [setSyncWithPresenterLayout] = useMutation(SET_SYNC_WITH_PRESENTER_LAYOUT);
  const [setMeetingLayoutProps] = useMutation(SET_LAYOUT_PROPS);
  const toggleVoice = useToggleVoice();
  const setLocalSettings = useUserChangedLocalSettings();

  const setMobileUser = (mobile) => {
    setMobileFlag({
      variables: {
        mobile,
      },
    });
  };

  const { data: currentUserData } = useCurrentUser((user) => ({
    enforceLayout: user.enforceLayout,
    isModerator: user.isModerator,
    presenter: user.presenter,
  }));

  const isModerator = currentUserData?.isModerator;
  const isPresenter = currentUserData?.presenter;

  const { sidebarContentPanel, isOpen: sidebarContentIsOpen } = sidebarContent;
  const { sidebarNavPanel, isOpen: sidebarNavigationIsOpen } = sidebarNavigation;
  const { isOpen } = presentation;
  const presentationIsOpen = isOpen;

  const { focusedId } = cameraDock;

  useEffect(() => {
    if (
      layoutContextDispatch
      && (typeof meetingLayout !== 'undefined')
      && (layoutType.current !== meetingLayout)
      && isSharedNotesPinned
    ) {
      layoutType.current = meetingLayout;
      MediaService.setPresentationIsOpen(layoutContextDispatch, true);
    }
  }, [meetingLayout, layoutContextDispatch, layoutType]);

  const horizontalPosition = cameraDock.position === 'contentLeft' || cameraDock.position === 'contentRight';
  // this is not exactly right yet
  let presentationVideoRate;
  if (horizontalPosition) {
    presentationVideoRate = cameraDock.width / window.innerWidth;
  } else {
    presentationVideoRate = cameraDock.height / window.innerHeight;
  }
  presentationVideoRate = parseFloat(presentationVideoRate.toFixed(2));

  const setPushLayout = () => {
    setSyncWithPresenterLayout({
      variables: {
        syncWithPresenterLayout: pushLayout,
      },
    });
  };

  const setMeetingLayout = () => {
    const { isResizing } = cameraDockInput;

    setMeetingLayoutProps({
      variables: {
        layout: selectedLayout,
        syncWithPresenterLayout: pushLayout,
        presentationIsOpen,
        isResizing,
        cameraPosition: cameraDock.position,
        focusedCamera: focusedId,
        presentationVideoRate,
      },
    });
  };

  const { data: currentMeeting } = useMeeting((m) => ({
    externalVideo: m.externalVideo,
  }));

  const isSharingVideo = !!currentMeeting?.externalVideo?.externalVideoUrl;

  useEffect(() => {
    MediaService.buildLayoutWhenPresentationAreaIsDisabled(layoutContextDispatch, isSharingVideo);
  });

  const shouldShowExternalVideo = isExternalVideoEnabled() && isSharingVideo;

  const shouldShowGenericComponent = !!genericComponent.genericComponentId;

  const validateEnforceLayout = (currentUser) => {
    const layoutTypes = Object.values(LAYOUT_TYPE);
    const enforceLayout = currentUser?.enforceLayout;
    return enforceLayout && layoutTypes.includes(enforceLayout) ? enforceLayout : null;
  };

  const shouldShowScreenshare = propsShouldShowScreenshare
    && (viewScreenshare || isPresenter);
  const shouldShowPresentation = (!shouldShowScreenshare && !shouldShowSharedNotes
    && !shouldShowExternalVideo && !shouldShowGenericComponent
    && (presentationIsOpen || presentationRestoreOnUpdate)) && isPresentationEnabled();
  return currentUserId
    ? (
      <App
        {...{
          actionsBarStyle,
          captionsStyle,
          currentUserId,
          setPushLayout,
          setMeetingLayout,
          meetingLayout,
          selectedLayout,
          pushLayout,
          pushLayoutMeeting,
          meetingLayoutUpdatedAt,
          presentationIsOpen,
          cameraPosition: cameraDock.position,
          focusedCamera: focusedId,
          presentationVideoRate,
          cameraWidth: cameraDock.width,
          cameraHeight: cameraDock.height,
          cameraIsResizing: cameraDockInput.isResizing,
          meetingPresentationIsOpen,
          isMeetingLayoutResizing,
          meetingLayoutCameraPosition,
          meetingLayoutFocusedCamera,
          meetingLayoutVideoRate,
          horizontalPosition,
          deviceType,
          layoutContextDispatch,
          sidebarNavPanel,
          sidebarNavigationIsOpen,
          sidebarContentPanel,
          sidebarContentIsOpen,
          shouldShowExternalVideo,
          isPresenter,
          numCameras: cameraDockInput.numCameras,
          enforceLayout: validateEnforceLayout(currentUserData),
          isModerator,
          shouldShowScreenshare,
          shouldShowSharedNotes,
          shouldShowPresentation,
          setMobileUser,
          toggleVoice,
          setLocalSettings,
          genericComponentId: genericComponent.genericComponentId,
        }}
        {...otherProps}
      />
    )
    : null;
};

const currentUserEmoji = (currentUser) => (currentUser
  ? {
    status: currentUser.emoji,
    changedAt: currentUser.emojiTime,
  }
  : {
    status: 'none',
    changedAt: null,
  }
);

export default withTracker(() => {
  Users.find({ userId: Auth.userID, }).observe({
    removed(userData) {
      // wait 3secs (before endMeeting), client will try to authenticate again
      const delayForReconnection = userData.ejected ? 0 : 3000;
      setTimeout(() => {
        const queryCurrentUser = Users.find({ userId: Auth.userID, meetingId: Auth.meetingID });
        if (queryCurrentUser.count() === 0) {
          if (userData.ejected) {
            endMeeting('403', userData.ejectedReason);
          } else {
            // Either authentication process hasn't finished yet or user did authenticate but Users
            // collection is unsynchronized. In both cases user may be able to rejoin.
            const description = Auth.isAuthenticating || Auth.loggedIn
              ? 'able_to_rejoin_user_disconnected_reason'
              : null;
            endMeeting('503', description);
          }
        }
      }, delayForReconnection);
    },
  });

  const currentUser = Users.findOne(
    { userId: Auth.userID },
    {
      fields:
      {
        approved: 1, emoji: 1, raiseHand: 1, away: 1, userId: 1, role: 1,
      },
    },
  );

  const meetingLayoutObj = Meetings
    .findOne({ meetingId: Auth.meetingID }) || {};

  const { layout } = meetingLayoutObj;

  const {
    propagateLayout: pushLayoutMeeting,
    cameraDockIsResizing: isMeetingLayoutResizing,
    cameraDockPlacement: meetingLayoutCameraPosition,
    cameraDockAspectRatio: meetingLayoutVideoRate,
    cameraWithFocus: meetingLayoutFocusedCamera,
  } = layout;
  const meetingLayout = LAYOUT_TYPE[layout.currentLayoutType];
  const meetingLayoutUpdatedAt = new Date(layout.updatedAt).getTime();

  const meetingPresentationIsOpen = !layout.presentationMinimized;

  const UserInfo = UserInfos.find({
    meetingId: Auth.meetingID,
    requesterUserId: Auth.userID,
  }).fetch();

  const AppSettings = Settings.application;
  const { selectedLayout, pushLayout } = AppSettings;
  const { viewScreenshare } = Settings.dataSaving;
  const shouldShowSharedNotes = MediaService.shouldShowSharedNotes();
  const shouldShowScreenshare = MediaService.shouldShowScreenshare();
  let customStyleUrl = getFromUserSettings('bbb_custom_style_url', false);

  if (!customStyleUrl && CUSTOM_STYLE_URL) {
    customStyleUrl = CUSTOM_STYLE_URL;
  }

  const LAYOUT_CONFIG = window.meetingClientSettings.public.layout;

  return {
    captions: CaptionsService.isCaptionsActive() ? <CaptionsContainer /> : null,
    audioCaptions: AudioCaptionsService.getAudioCaptions() ? <AudioCaptionsLiveContainer /> : null,
    fontSize: getFontSize(),
    hasBreakoutRooms: getBreakoutRooms().length > 0,
    customStyle: getFromUserSettings('bbb_custom_style', false),
    customStyleUrl,
    UserInfo,
    notify,
    isPhone: deviceInfo.isPhone,
    isRTL: document.documentElement.getAttribute('dir') === 'rtl',
    currentUserEmoji: currentUserEmoji(currentUser),
    currentUserAway: currentUser.away,
    currentUserRaiseHand: currentUser.raiseHand,
    currentUserId: currentUser?.userId,
    meetingLayout,
    meetingLayoutUpdatedAt,
    meetingPresentationIsOpen,
    isMeetingLayoutResizing,
    meetingLayoutCameraPosition,
    meetingLayoutFocusedCamera,
    meetingLayoutVideoRate,
    selectedLayout,
    pushLayout,
    pushLayoutMeeting,
    audioAlertEnabled: AppSettings.chatAudioAlerts,
    pushAlertEnabled: AppSettings.chatPushAlerts,
    darkTheme: AppSettings.darkTheme,
    shouldShowScreenshare,
    viewScreenshare,
    shouldShowSharedNotes,
    isLargeFont: Session.get('isLargeFont'),
    presentationRestoreOnUpdate: getFromUserSettings(
      'bbb_force_restore_presentation_on_new_events',
      window.meetingClientSettings.public.presentation.restoreOnUpdate,
    ),
    hidePresentationOnJoin: getFromUserSettings('bbb_hide_presentation_on_join', LAYOUT_CONFIG.hidePresentationOnJoin),
    hideActionsBar: getFromUserSettings('bbb_hide_actions_bar', false),
    hideNavBar: getFromUserSettings('bbb_hide_nav_bar', false),
    ignorePollNotifications: Session.get('ignorePollNotifications'),
    isSharedNotesPinned: MediaService.shouldShowSharedNotes(),
  };
})(AppContainer);

#import <CallKit/CallKit.h>
#import <Foundation/Foundation.h>

/// CallKit's undocumented setter does `[argument URL]`. A Swift `URL` passed
/// through `perform(_:with:)` is already an `NSURL`, so that call throws and
/// kills the VoIP wake. Catch every attempt. Never let this abort
/// `reportNewIncomingCall`.
BOOL EdgeCallKitApplyCallerImageURL(CXCallUpdate *update, NSURL *url) {
  if (update == nil || url == nil) {
    return NO;
  }

  @try {
    NSURLRequest *request = [NSURLRequest requestWithURL:url];
    [update setValue:request forKey:@"localizedCallerImageURL"];
    NSLog(@"EdgeCallKit avatar apply NSURLRequest");
    return YES;
  } @catch (NSException *exception) {
    NSLog(@"EdgeCallKit avatar apply NSURLRequest failed: %@", exception.reason);
  }

  @try {
    [update setValue:url forKey:@"localizedCallerImageURL"];
    NSLog(@"EdgeCallKit avatar apply NSURL");
    return YES;
  } @catch (NSException *exception) {
    NSLog(@"EdgeCallKit avatar apply NSURL failed: %@", exception.reason);
  }

  return NO;
}
